export type MeResponse = {
  user: {
    id: string;
    email: string;
    fullName: string | null;
    firstName?: string | null;
    lastName?: string | null;
    avatarUrl?: string | null;
    jobTitle?: string | null;
    jobFunction?: string | null;
    defaultWorkspaceId?: string | null;
  } | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
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

export async function logoutRequest() {
  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } finally {
    document.cookie =
      "pp_access_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    localStorage.removeItem("pp_me");
    sessionStorage.removeItem("pp_me");
  }
}