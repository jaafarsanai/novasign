import React, { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, getMe, type MeResponse } from "../api/api";

type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  description?: string | null;
  timezone?: string | null;
  createdAt?: string;
  updatedAt?: string;
  _count?: {
    memberships: number;
    screens: number;
    playlists: number;
    channels: number;
    media: number;
  };
};

type WorkspacesListResponse = {
  items: WorkspaceItem[];
};

const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Qatar",
  "Europe/Paris",
  "Europe/London",
  "Europe/Berlin",
  "Africa/Tunis",
  "Africa/Casablanca",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Asia/Amman",
  "Asia/Beirut",
  "Asia/Jerusalem",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function uniqueTimezones() {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return Array.from(new Set([browserTz, ...COMMON_TIMEZONES])).sort((a, b) =>
    a.localeCompare(b),
  );
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingOrg, setSavingOrg] = useState(false);
  const [savingWs, setSavingWs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [me, setMe] = useState<MeResponse | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);

  const [organizationName, setOrganizationName] = useState("");
  const [organizationTimezone, setOrganizationTimezone] = useState("UTC");

  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceDescription, setWorkspaceDescription] = useState("");
  const [workspaceTimezone, setWorkspaceTimezone] = useState("UTC");

  const timezoneOptions = useMemo(() => uniqueTimezones(), []);

  const activeWorkspace = useMemo(() => {
    if (!workspaceId) return null;
    return workspaces.find((w) => w.id === workspaceId) || null;
  }, [workspaceId, workspaces]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        setSuccess(null);

        const [meRes, wsRes] = await Promise.all([
          getMe(),
          apiGet<WorkspacesListResponse>("/workspaces"),
        ]);

        if (!active) return;

        setMe(meRes);
        setWorkspaces(wsRes.items || []);

        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

        setOrganizationName(meRes?.organization?.name || "");
        setOrganizationTimezone(
          meRes?.organization?.timezone?.trim() || browserTz || "UTC",
        );

        const initialWorkspaceId =
          meRes?.auth?.activeWorkspaceId ||
          meRes?.user?.defaultWorkspaceId ||
          wsRes.items?.[0]?.id ||
          "";

        setWorkspaceId(initialWorkspaceId);

        const initialWorkspace =
          wsRes.items?.find((w) => w.id === initialWorkspaceId) ||
          wsRes.items?.[0] ||
          null;

        setWorkspaceName(initialWorkspace?.name || "");
        setWorkspaceDescription(initialWorkspace?.description || "");
        setWorkspaceTimezone(
          initialWorkspace?.timezone?.trim() ||
            meRes?.organization?.timezone?.trim() ||
            browserTz ||
            "UTC",
        );
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Failed to load account settings");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspace) return;

    const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setWorkspaceName(activeWorkspace.name || "");
    setWorkspaceDescription(activeWorkspace.description || "");
    setWorkspaceTimezone(
      activeWorkspace.timezone?.trim() ||
        organizationTimezone ||
        browserTz ||
        "UTC",
    );
  }, [activeWorkspace, organizationTimezone]);

  async function saveOrganization(e: React.FormEvent) {
    e.preventDefault();
    if (!me?.organization?.id) return;

    try {
      setSavingOrg(true);
      setError(null);
      setSuccess(null);

      const res = await apiPatch<{
        item: {
          id: string;
          name: string;
          slug: string;
          timezone?: string | null;
        };
      }>(`/organizations/${me.organization.id}`, {
        name: organizationName,
        timezone: organizationTimezone,
      });

      setOrganizationName(res.item.name);
      setOrganizationTimezone(res.item.timezone?.trim() || "UTC");

      setMe((prev) =>
        prev
          ? {
              ...prev,
              organization: prev.organization
                ? {
                    ...prev.organization,
                    name: res.item.name,
                    timezone: res.item.timezone ?? "UTC",
                  }
                : prev.organization,
            }
          : prev,
      );

      setSuccess("Organization settings updated");
    } catch (err: any) {
      setError(err?.message || "Failed to update organization settings");
    } finally {
      setSavingOrg(false);
    }
  }

  async function saveWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) return;

    try {
      setSavingWs(true);
      setError(null);
      setSuccess(null);

      const res = await apiPatch<{ item: WorkspaceItem }>(`/workspaces/${workspaceId}`, {
        name: workspaceName,
        description: workspaceDescription,
        timezone: workspaceTimezone,
      });

      setWorkspaces((prev) =>
        prev.map((w) => (w.id === workspaceId ? { ...w, ...res.item } : w)),
      );

      setWorkspaceName(res.item.name || "");
      setWorkspaceDescription(res.item.description || "");
      setWorkspaceTimezone(res.item.timezone?.trim() || "UTC");

      setSuccess("Workspace settings updated");
    } catch (err: any) {
      setError(err?.message || "Failed to update workspace settings");
    } finally {
      setSavingWs(false);
    }
  }

  if (loading) {
    return <div style={{ padding: 24 }}>Loading account settings...</div>;
  }

  return (
    <div style={{ padding: 24, maxWidth: 920 }}>
      <h1 style={{ margin: 0, fontSize: 28 }}>Account Settings</h1>
      <p style={{ marginTop: 8, color: "#6b7280" }}>
        Manage your organization and workspace profile, including timezone defaults
        used across the platform.
      </p>

      {error ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: "#fee2e2",
            color: "#991b1b",
          }}
        >
          {error}
        </div>
      ) : null}

      {success ? (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 10,
            background: "#dcfce7",
            color: "#166534",
          }}
        >
          {success}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 20,
          marginTop: 24,
        }}
      >
        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Organization</h2>

          <form onSubmit={saveOrganization}>
            <div style={{ display: "grid", gap: 14 }}>
              <label style={{ display: "grid", gap: 8 }}>
                <span>Organization name</span>
                <input
                  type="text"
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  required
                  style={{
                    height: 42,
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    padding: "0 12px",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 8 }}>
                <span>Organization timezone</span>
                <select
                  value={organizationTimezone}
                  onChange={(e) => setOrganizationTimezone(e.target.value)}
                  style={{
                    height: 42,
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    padding: "0 12px",
                    background: "#fff",
                  }}
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <button
                  type="submit"
                  disabled={savingOrg}
                  style={{
                    height: 42,
                    border: 0,
                    borderRadius: 10,
                    padding: "0 16px",
                    cursor: "pointer",
                  }}
                >
                  {savingOrg ? "Saving..." : "Save organization"}
                </button>
              </div>
            </div>
          </form>
        </section>

        <section
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            padding: 20,
            background: "#fff",
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Workspace</h2>

          <div style={{ display: "grid", gap: 14 }}>
            <label style={{ display: "grid", gap: 8 }}>
              <span>Select workspace</span>
              <select
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                style={{
                  height: 42,
                  borderRadius: 10,
                  border: "1px solid #d1d5db",
                  padding: "0 12px",
                  background: "#fff",
                }}
              >
                {workspaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.status})
                  </option>
                ))}
              </select>
            </label>

            <form onSubmit={saveWorkspace}>
              <div style={{ display: "grid", gap: 14 }}>
                <label style={{ display: "grid", gap: 8 }}>
                  <span>Workspace name</span>
                  <input
                    type="text"
                    value={workspaceName}
                    onChange={(e) => setWorkspaceName(e.target.value)}
                    required
                    style={{
                      height: 42,
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      padding: "0 12px",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 8 }}>
                  <span>Description</span>
                  <textarea
                    value={workspaceDescription}
                    onChange={(e) => setWorkspaceDescription(e.target.value)}
                    rows={4}
                    style={{
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      padding: 12,
                      resize: "vertical",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: 8 }}>
                  <span>Workspace timezone</span>
                  <select
                    value={workspaceTimezone}
                    onChange={(e) => setWorkspaceTimezone(e.target.value)}
                    style={{
                      height: 42,
                      borderRadius: 10,
                      border: "1px solid #d1d5db",
                      padding: "0 12px",
                      background: "#fff",
                    }}
                  >
                    {timezoneOptions.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>

                {activeWorkspace?._count ? (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc" }}>
                      Members: {activeWorkspace._count.memberships}
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc" }}>
                      Screens: {activeWorkspace._count.screens}
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc" }}>
                      Playlists: {activeWorkspace._count.playlists}
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc" }}>
                      Channels: {activeWorkspace._count.channels}
                    </div>
                    <div style={{ padding: 12, borderRadius: 12, background: "#f8fafc" }}>
                      Media: {activeWorkspace._count.media}
                    </div>
                  </div>
                ) : null}

                <div>
                  <button
                    type="submit"
                    disabled={savingWs || !workspaceId}
                    style={{
                      height: 42,
                      border: 0,
                      borderRadius: 10,
                      padding: "0 16px",
                      cursor: "pointer",
                    }}
                  >
                    {savingWs ? "Saving..." : "Save workspace"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
