export type OrganizationRole = "ORG_OWNER" | "ORG_ADMIN" | "ORG_AUDITOR" | "MEMBER";
export type WorkspaceRole = "WORKSPACE_ADMIN" | "CONTENT_MANAGER" | "EDITOR" | "VIEWER";

export interface AuthContext {
  userId: string;
  email: string;
  organizationId: string;
  activeWorkspaceId: string | null;
  organizationRole: OrganizationRole;
  workspaceRole: WorkspaceRole | null;
}