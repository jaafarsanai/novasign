export const API_BASE =
  (import.meta as any).env?.VITE_API_URL?.replace(/\/+$/, "") || "/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return undefined as T;
  return (await res.json()) as T;
}

export function apiGet<T>(path: string) {
  return request<T>(path, { method: "GET" });
}

export function apiPost<T = any>(path: string, body?: any) {
  return request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPut<T = any>(path: string, body?: any) {
  return request<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiPatch<T = any>(path: string, body?: any) {
  return request<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function apiDelete<T = any>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

export type MeResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    defaultWorkspaceId: string | null;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    timezone?: string | null;
    createdAt?: string;
    updatedAt?: string;
  } | null;
  auth: {
    userId: string;
    email: string;
    organizationId: string;
    activeWorkspaceId: string | null;
    organizationRole: string;
    workspaceRole: string | null;
  };
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    role: string;
    timezone?: string | null;
  }>;
};

export type LicenseSummaryResponse = {
  totalQuota: number;
  used: number;
  available: number;
  activeLicenses: number;
  timezone: string;
  trial: null | {
    isTrial: boolean;
    status: string;
    startsAt: string;
    expiresAt: string;
    trialDays: number;
    screenQuota: number;
    isExpired: boolean;
    daysRemaining: number | null;
    timezone: string;
  };
  licenses: Array<{
    id: string;
    licenseType: string;
    status: string;
    screenQuota: number;
    trialDays: number | null;
    startsAt: string;
    expiresAt: string;
  }>;
};

export async function getMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (res.status === 401) return null;
    if (!res.ok) return null;

    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

export function getLicenseSummary() {
  return apiGet<LicenseSummaryResponse>("/licenses/summary");
}

export async function logoutRequest() {
  document.cookie =
    "pp_access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  }).catch(() => {});
}