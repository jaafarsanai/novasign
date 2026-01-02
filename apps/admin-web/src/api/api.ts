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

  // allow empty responses
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return (undefined as any);
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

export function apiDelete<T = any>(path: string) {
  return request<T>(path, { method: "DELETE" });
}

