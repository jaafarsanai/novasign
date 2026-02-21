const express = require("express");
const sql = require("mssql");
const { exec } = require("child_process");

const app = express();

/* ===============================
   BODY PARSING
================================= */

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

/* ===============================
   CONFIG
================================= */

const CONFIG = {
  serverPort: 3000,

  exchange: {
    ewsUrl: "https://mail.sotc.sec/EWS/Exchange.asmx",
    user: "roomdelegate",
    password: "R00m@Q@F@2025",
    domain: "SOTC",
    exchangeTzOffsetHours: 3,
    curlTimeoutSec: 25
  }
};

const TIMS_CONFIG = {
  user: "svc-TimsRoomBook",
  password: "TIMS_ReadOnly_2026!",
  server: "172.31.165.8",
  database: "TIMSDB",
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
};

const TIMS_TABLE = "ApprovedSessionsView";

/* ===============================
   TIMS CONNECTION (POOL ONCE)
================================= */

let pool;

async function initDb() {
  try {
    pool = await sql.connect(TIMS_CONFIG);
    console.log("[TIMS] Connected (pooled)");
  } catch (err) {
    console.error("[TIMS ERROR]", err);
    process.exit(1);
  }
}

/* ===============================
   TIMS QUERY
================================= */
function clean(str) {
  if (!str) return "";
  return str
    .replace(/'/g, "''")
    .replace(/"/g, '""')
    .replace(/\\/g, "\\\\")
    .replace(/[;|]/g, "");
}
function forceFormat(value) {
  const d = new Date(value);

  const pad = n => n.toString().padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatDate(d) {
  const pad = n => n.toString().padStart(2, "0");

  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function debugEvents(label, events) {
  console.log(`\n========= ${label} =========`);
  if (!events || events.length === 0) {
    console.log("No events.");
    return;
  }

  events.forEach((e, i) => {
    console.log(`Event #${i + 1}`);
    console.log("Source:", e.source);
    console.log("Title:", e.title);
    console.log("Location:", e.location);
    console.log("Start (raw):", e.start);
    console.log("End (raw):", e.end);
    console.log("-----------------------------");
  });
}

async function fetchTimsEvents(roomName, timeMin, timeMax) {

  const normalizedRoom = roomName.replace(/\s+/g, " ").trim();

  const result = await pool.request()
    .input("room", sql.VarChar, normalizedRoom)
    .input("timeMin", sql.DateTime2, timeMin)
    .input("timeMax", sql.DateTime2, timeMax)
    .query(`
      SELECT SessionName, StartTime, EndTime, TrainingAreaName, StaffMembers
      FROM ${TIMS_TABLE}
      WHERE REPLACE(TrainingAreaName, '  ', ' ') LIKE '%' + @room + '%'
        AND EndTime >= @timeMin
        AND StartTime < @timeMax
      ORDER BY StartTime ASC
    `);

  return result.recordset.map(row => {

  const start = new Date(row.StartTime);
  const end = new Date(row.EndTime);

  return {
    source: "TIMS",
    title: row.SessionName,
    location: row.TrainingAreaName,
    start: formatDate(start),
    end: formatDate(end),
    organizer: row.StaffMembers
  };
});

}

/* ===============================
   EXCHANGE QUERY
================================= */

const { execFile } = require("child_process");

function fetchExchangeEvents(roomName, timeMin, timeMax) {
  return new Promise((resolve) => {

    if (!roomName || roomName.includes(" ")) {
      console.log(`[EXCHANGE] Skipped: ${roomName}`);
      return resolve([]);
    }

    const email = `${roomName}@sotc.sec`;

    const soapBody = `
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:m="http://schemas.microsoft.com/exchange/services/2006/messages"
               xmlns:t="http://schemas.microsoft.com/exchange/services/2006/types"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Header>
    <t:RequestServerVersion Version="Exchange2013" />
  </soap:Header>
  <soap:Body>
    <m:FindItem Traversal="Shallow">
      <m:ItemShape>
        <t:BaseShape>AllProperties</t:BaseShape>
      </m:ItemShape>
      <m:CalendarView StartDate="${timeMin.toISOString()}"
                      EndDate="${timeMax.toISOString()}" />
      <m:ParentFolderIds>
        <t:DistinguishedFolderId Id="calendar">
          <t:Mailbox>
            <t:EmailAddress>${email}</t:EmailAddress>
          </t:Mailbox>
        </t:DistinguishedFolderId>
      </m:ParentFolderIds>
    </m:FindItem>
  </soap:Body>
</soap:Envelope>`;

    const args = [
      "--silent",
      "--show-error",
      "--fail",
      "--insecure",
      "--ntlm",
      "--max-time", CONFIG.exchange.curlTimeoutSec.toString(),
      "-u", `${CONFIG.exchange.domain}\\${CONFIG.exchange.user}:${CONFIG.exchange.password}`,
      "-H", "Content-Type: text/xml",
      "-d", soapBody,
      CONFIG.exchange.ewsUrl
    ];

    execFile("curl", args, (error, stdout) => {

      if (error) {
        console.log("[EXCHANGE ERROR]", error.message);
        return resolve([]);
      }

      resolve(parseExchangeResponse(stdout));
    });

  });
}

/* ===============================
   EXCHANGE PARSER
================================= */

function parseExchangeResponse(xml) {

  const events = [];
  const matches = xml.match(/<t:CalendarItem>[\s\S]*?<\/t:CalendarItem>/g);

  if (!matches) return [];

  for (const item of matches) {

    const subject = extractTag(item, "t:Subject");
    const start = new Date(extractTag(item, "t:Start"));
    const end = new Date(extractTag(item, "t:End"));

  const offsetMs = CONFIG.exchange.exchangeTzOffsetHours * 60 * 60 * 1000;

const adjustedStart = new Date(start.getTime() + offsetMs);
const adjustedEnd = new Date(end.getTime() + offsetMs);

events.push({
  source: "EXCHANGE",
  title: subject,
  start: formatDate(adjustedStart),
  end: formatDate(adjustedEnd)
});
  }

  return events;
}

function extractTag(text, tag) {
  const regex = new RegExp(`<${tag}>(.*?)<\\/${tag}>`);
  const match = text.match(regex);
  return match ? match[1] : "";
}

/* ===============================
   MERGE EVENTS
================================= */

function mergeEvents(tims, exchange) {
  return [...tims, ...exchange];
}

/* ===============================
   API ENDPOINT
================================= */

app.post("/api/", async (req, res) => {

  try {

    if (!req.body || !req.body.room) {
      return res.json({
        results: false,
        events: [],
        error: "Room missing"
      });
    }

    const room = req.body.room.trim();
    const days = Number(req.body.ms_exchange_event_active_days || 3);

    console.log("[REQUEST ROOM]:", room);

    const now = new Date();
    const timeMin = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const timsEvents = await fetchTimsEvents(room, timeMin, timeMax);
    debugEvents("TIMS EVENTS", timsEvents);

    const exchangeEvents = await fetchExchangeEvents(room, timeMin, timeMax);
    debugEvents("EXCHANGE EVENTS", exchangeEvents);

    const merged = mergeEvents(timsEvents, exchangeEvents);

    const eventsData = merged.map((event, index) => {

      const startFormatted = forceFormat(event.start);
      const endFormatted = forceFormat(event.end);

      return {
        id: `${room}-${index}-${Date.now()}`,
        change_key: Date.now().toString(),
        start: startFormatted,
        end: endFormatted,
        subject: clean(event.title || "Untitled Event"),
        location: clean(event.location || room),
        organizer: clean(event.organizer || ""),
        organizer_email: "",
        body: "",
        attendees: [],
        sensitivity: "normal"
      };
    });

    return res.json({
      results: eventsData.length > 0,
      events: eventsData,
      error: eventsData.length > 0 ? "" : "No events found"
    });

  } catch (err) {

    console.error("API ERROR:", err);

    return res.json({
      results: false,
      events: [],
      error: err.message
    });
  }
});
/* ===============================
   START SERVER
================================= */

initDb().then(() => {
  app.listen(CONFIG.serverPort, () => {
    console.log(`[BOOT] Server running on port ${CONFIG.serverPort}`);
  });
});