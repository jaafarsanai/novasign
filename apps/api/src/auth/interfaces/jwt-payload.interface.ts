export interface JwtPayload {
  sub: string;
  email: string;
  organizationId: string;
  activeWorkspaceId?: string | null;
}