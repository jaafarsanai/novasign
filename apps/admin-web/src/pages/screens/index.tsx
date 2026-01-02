import React, { useEffect, useMemo, useState } from "react";
import PairScreenModal from "./components/PairScreenModal";
import DeleteScreenModal from "./components/DeleteScreenModal";
import { RenameScreenModal } from "./components/RenameScreenModal";
import "./ScreensPage.css";

type ScreenDto = {
  id: string;
  name?: string | null;
  pairingCode: string;
  status?: string | null;
  lastSeenAt?: string | null;
  isVirtual?: boolean | null;
};

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok) {
    const msg =
      json?.message ||
      json?.error ||
      (text && text.slice(0, 200)) ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return (json ?? (text as any)) as T;
}

function formatLastSeen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function statusLabel(raw?: string | null) {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "—";
  return s;
}

export default function ScreensPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [screens, setScreens] = useState<ScreenDto[]>([]);

  const [search, setSearch] = useState("");

  const [isPairModalOpen, setIsPairModalOpen] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ScreenDto | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScreenDto | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // which row menu is open
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const closePairModal = () => setIsPairModalOpen(false);
  const openPairModal = () => setIsPairModalOpen(true);

  async function loadScreens() {
    setLoading(true);
    setError("");
    try {
      const data = await apiJson<ScreenDto[]>("/api/screens");
      setScreens(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setError(e?.message || "Failed to load screens.");
      setScreens([]);
    } finally {
      setLoading(false);
    }
  }

  async function handlePairSuccess() {
    closePairModal();
    await loadScreens();
  }

  async function launchVirtualScreen() {
    setError("");
    try {
      // expected endpoint: POST /api/screens/virtual-session -> { code }
      const r = await apiJson<{ code: string }>("/api/screens/virtual-session", { method: "POST" });
      const code = String(r?.code || "").trim().toUpperCase();
      if (!code) throw new Error("Virtual session returned no code.");
      window.open(`/virtual-screen/${code}`, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      setError(e?.message || "Failed to launch virtual screen.");
    }
  }

  function openPreview(screen: ScreenDto) {
    const code = String(screen.pairingCode || "").trim().toUpperCase();
    if (!code) {
      setError("This screen has no pairing code.");
      return;
    }
    window.open(`/virtual-screen/${code}`, "_blank", "noopener,noreferrer");
  }

  function requestRename(screen: ScreenDto) {
    setOpenMenuId(null);
    setRenameError(null);
    setRenameTarget(screen);
    setRenameOpen(true);
  }

  async function saveRename(name: string) {
    if (!renameTarget) return;
    setRenameSaving(true);
    setRenameError(null);
    try {
      await apiJson(`/api/screens/${renameTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setRenameOpen(false);
      setRenameTarget(null);
      await loadScreens();
    } catch (e: any) {
      setRenameError(e?.message || "Failed to rename screen.");
    } finally {
      setRenameSaving(false);
    }
  }

  function requestDelete(screen: ScreenDto) {
    setOpenMenuId(null);
    setDeleteError(null);
    setDeleteTarget(screen);
    setDeleteOpen(true);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await apiJson(`/api/screens/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteOpen(false);
      setDeleteTarget(null);
      await loadScreens();
    } catch (e: any) {
      setDeleteError(e?.message || "Failed to delete screen.");
    } finally {
      setDeleteSubmitting(false);
    }
  }

  useEffect(() => {
    loadScreens();
  }, []);

  // close menu on outside click / escape
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest?.(".ns2-row-menu") || target.closest?.(".ns2-menu-btn")) return;
      setOpenMenuId(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return screens;
    return screens.filter((s) => {
      const name = String(s.name || "").toLowerCase();
      const code = String(s.pairingCode || "").toLowerCase();
      const status = String(s.status || "").toLowerCase();
      return name.includes(q) || code.includes(q) || status.includes(q);
    });
  }, [screens, search]);

  const isEmpty = !loading && !error && screens.length === 0;

  return (
    <div className="ns2-screens-page">
      <div className="ns2-screens-header">
        <div className="ns2-screens-title">
          <h1>Screens</h1>
          <p>Manage your connected screens, players and virtual screens.</p>
        </div>

        <div className="ns2-screens-actions">
          <input
            className="ns2-screens-search"
            placeholder="Search Screens"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="ns2-linkbtn" type="button" onClick={launchVirtualScreen}>
            Launch virtual screen
          </button>
          <button className="ns2-linkbtn" type="button" onClick={openPairModal}>
            Pair screen
          </button>
        </div>
      </div>

      {error ? <div className="ns2-error">{error}</div> : null}

      {/* EMPTY STATE (Screenshot1) */}
      {isEmpty ? (
        <div className="ns2-empty-wrap">
          <div className="ns2-empty-bg" />
          <div className="ns2-empty-inner">
            <div className="ns2-empty-head">Okay, let's get a screen up and running</div>

            <div className="ns2-empty-grid">
              <div className="ns2-empty-card dark">
                <div className="ns2-empty-card-inner">
                  <div className="ns2-empty-card-title">I know what I'm doing</div>
                  <div className="ns2-empty-card-sub">
                    I have a screen displaying a pairing code and I'm ready to connect.
                  </div>
                  <button className="ns2-cta-btn yellow" type="button" onClick={openPairModal}>
                    Pair your screen now
                  </button>
                </div>
              </div>

              <div className="ns2-empty-card purple">
                <div className="ns2-empty-card-inner">
                  <div className="ns2-empty-purple-row">
                    <div>
                      <div className="ns2-empty-card-title">I just want to experiment with it</div>
                      <div className="ns2-empty-card-sub" style={{ textAlign: "left" }}>
                        No screen, no problem. While you consider your hardware options, you can
                        launch a virtual screen to pair and display content on.
                      </div>
                      <button className="ns2-cta-btn white" type="button" onClick={launchVirtualScreen}>
                        Launch a Virtual Screen
                      </button>
                    </div>
                    <div className="ns2-purple-illus" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>

            <div className="ns2-empty-help">
              <p>
                To learn more about suitable hardware, check your options and best practices before deploying to
                production screens.
              </p>
              <a href="#" onClick={(e) => e.preventDefault()}>
                Look at hardware options
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {/* TABLE STATE */}
      {!isEmpty ? (
        <div className="ns2-table-wrap">
          {loading ? (
            <div className="ns2-muted">Loading…</div>
          ) : (
            <div className="ns2-table-card">
              <div className="ns2-table-head">
                <div className="ns2-th">Screen</div>
                <div className="ns2-th">Type</div>
                <div className="ns2-th">Status</div>
                <div className="ns2-th">Last seen</div>
                <div className="ns2-th ns2-th-actions" aria-hidden="true" />
              </div>

              {filtered.length === 0 ? (
                <div className="ns2-empty-row">No screens yet.</div>
              ) : (
                filtered.map((s) => {
                  const name = (s.name || "").trim() || "Unnamed screen";
                  const type = s.isVirtual ? "Virtual" : "Physical";
                  const status = statusLabel(s.status);
                  const lastSeen = formatLastSeen(s.lastSeenAt);

                  return (
                    <div className="ns2-tr" key={s.id}>
                      <div className="ns2-td ns2-td-main">
                        <div className="ns2-screen-name">{name}</div>
                        <div className="ns2-screen-sub">{String(s.pairingCode || "").toUpperCase()}</div>
                      </div>

                      <div className="ns2-td">
                        <span className="ns2-pill">{type}</span>
                      </div>

                      <div className="ns2-td">
                        <span className={`ns2-badge ${status === "LIVE" ? "ok" : "neutral"}`}>{status}</span>
                      </div>

                      <div className="ns2-td ns2-lastseen">{lastSeen}</div>

                      <div className="ns2-td ns2-actions">
                        <button
                          type="button"
                          className="ns2-menu-btn"
                          aria-haspopup="menu"
                          aria-expanded={openMenuId === s.id}
                          onClick={() => setOpenMenuId((prev) => (prev === s.id ? null : s.id))}
                        >
                          …
                        </button>

                        {openMenuId === s.id ? (
                          <div className="ns2-row-menu" role="menu">
                            <button type="button" className="ns2-menu-item" onClick={() => openPreview(s)}>
                              Preview
                            </button>
                            <button type="button" className="ns2-menu-item" onClick={() => requestRename(s)}>
                              Rename
                            </button>
                            <button type="button" className="ns2-menu-item danger" onClick={() => requestDelete(s)}>
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* Modals */}
      <PairScreenModal open={isPairModalOpen} onClose={closePairModal} onPaired={handlePairSuccess} />

      <RenameScreenModal
        open={renameOpen}
        initialName={(renameTarget?.name || "").trim() || "Virtual Screen"}
        onCancel={() => {
          if (renameSaving) return;
          setRenameOpen(false);
          setRenameTarget(null);
          setRenameError(null);
        }}
        onSave={saveRename}
      />
      {renameError ? <div className="ns2-error ns2-error-inline">{renameError}</div> : null}

      <DeleteScreenModal
        open={deleteOpen}
        screenName={(deleteTarget?.name || "").trim() || "this screen"}
        onClose={() => {
          if (deleteSubmitting) return;
          setDeleteOpen(false);
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={confirmDelete}
        isSubmitting={deleteSubmitting}
        error={deleteError}
      />
    </div>
  );
}

