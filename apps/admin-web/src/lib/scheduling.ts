// /opt/novasign/apps/admin-web/src/lib/scheduling.ts
// Shared scheduling + fullscreen override logic (used by Admin UI & Player)

export type Weekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type ScheduleTimeWindow = {
  id: string;
  startTime: string; // "HH:mm:ss"
  endTime: string;   // "HH:mm:ss"
};

export type ZoneItemSchedule = {
  id: string;

  // Weekly scheduling
  mode: "everyday" | "weekly";
  weeklyDays: Weekday[];

  // Specific date only
  dateOnlyEnabled: boolean;
  dateStart: string | null; // "YYYY-MM-DD"
  dateEnd: string | null;   // "YYYY-MM-DD"
  timeWindows: ScheduleTimeWindow[];

  // Options
  playInFullScreen: boolean;
  priority: boolean;
};

export type ZoneContentItem = {
  id?: string; // client-only (admin), may not exist in backend
  sourceType: "media" | "playlist";
  sourceId: string;
  name: string;
  mediaType?: "image" | "video";
  durationSec: number;
  order: number;

  schedules?: ZoneItemSchedule[];
  schedule?: ZoneItemSchedule; // legacy
};

export type ChannelZones = Record<string, ZoneContentItem[]>;


function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function toYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function weekdayOf(d: Date): Weekday {
  // JS: 0=Sun..6=Sat
  const map: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[d.getDay()];
}

function normalizeTime(t: string) {
  // Accepts:
  // - "HH:mm"
  // - "HH:mm:ss"
  // - "HH:mm AM/PM"
  // - "HH:mm:ss AM/PM"
  // Returns 24h "HH:mm:ss"

  const raw = String(t ?? "").trim();
  if (!raw) return "00:00:00";

  // Detect AM/PM suffix
  const m = raw.match(/\s*(AM|PM)\s*$/i);
  const ampm = m ? m[1].toUpperCase() : null;
  const withoutSuffix = m ? raw.replace(/\s*(AM|PM)\s*$/i, "").trim() : raw;

  const parts = withoutSuffix.split(":").map((x) => x.trim());
  if (parts.length < 2) return "00:00:00";

  let hh = clampInt(Number(parts[0] || 0), 0, 23);
  const mm = clampInt(Number(parts[1] || 0), 0, 59);

  // seconds may contain junk in some legacy strings; strip non-digits safely
  const secRaw = (parts[2] || "0").replace(/[^\d]/g, "");
  const ss = clampInt(Number(secRaw || 0), 0, 59);

  // Convert 12h -> 24h if AM/PM provided
  if (ampm) {
    // In 12h format, hours should be 1..12. We'll normalize safely.
    const h12 = clampInt(Number(parts[0] || 0), 0, 12);
    if (ampm === "AM") {
      hh = h12 === 12 ? 0 : h12;
    } else {
      // PM
      hh = h12 === 12 ? 12 : h12 + 12;
    }
  }

  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
}


function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function timeToSec(hms: string) {
  const norm = normalizeTime(hms);
  const [h, m, s] = norm.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
}

function nowSecOfDay(d: Date) {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

export function ensureSchedules(it: ZoneContentItem): ZoneItemSchedule[] {
  if (Array.isArray(it.schedules) && it.schedules.length) return it.schedules;
  if (it.schedule) return [it.schedule];
  return [];
}

export function isScheduleActive(s: ZoneItemSchedule, now: Date) {
  const ymd = toYmd(now);

  // Specific date only
  if (s.dateOnlyEnabled) {
    if (!s.dateStart || !s.dateEnd) return false;
    if (ymd < s.dateStart) return false;
    if (ymd > s.dateEnd) return false;

    // time windows: if empty => all day
    if (!s.timeWindows || s.timeWindows.length === 0) return true;

    const t = nowSecOfDay(now);

    return s.timeWindows.some((w) => {
  const a = timeToSec(w.startTime);
  const b = timeToSec(w.endTime);
  const t = nowSecOfDay(now);

  // normal range
  if (b >= a) return t >= a && t <= b;

  // crosses midnight
  return t >= a || t <= b;
});

  }

  // Weekly / Everyday
  const wd = weekdayOf(now);

  // If weeklyDays empty -> treat as all week
  const days =
    s.weeklyDays?.length ? s.weeklyDays : (["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as Weekday[]);

  return days.includes(wd);
}

export function pickFullscreenOverride(zones: ChannelZones, now = new Date()) {
  const candidates: Array<{
    zoneId: string;
    item: ZoneContentItem;
    schedule: ZoneItemSchedule;
  }> = [];

  for (const [zoneId, items] of Object.entries(zones || {})) {
    for (const item of items || []) {
      const schedules = ensureSchedules(item);
      for (const sch of schedules) {
        if (!sch) continue;
        if (!sch.playInFullScreen) continue;
        if (!isScheduleActive(sch, now)) continue;

        candidates.push({ zoneId, item, schedule: sch });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort: priority desc, order asc, zoneId asc
  candidates.sort((a, b) => {
    const ap = a.schedule.priority ? 1 : 0;
    const bp = b.schedule.priority ? 1 : 0;
    if (bp !== ap) return bp - ap;
    if ((a.item.order ?? 0) !== (b.item.order ?? 0)) return (a.item.order ?? 0) - (b.item.order ?? 0);
    return a.zoneId.localeCompare(b.zoneId);
  });

  return candidates[0];
}
