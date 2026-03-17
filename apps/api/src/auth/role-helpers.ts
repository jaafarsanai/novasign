// src/auth/role-helpers.ts
import { AuthContext } from './interfaces/auth-context.interface';

export function isOrgAdmin(auth: AuthContext): boolean {
  return auth.organizationRole === 'ORG_OWNER' || auth.organizationRole === 'ORG_ADMIN';
}

export function requireActiveWorkspace(auth: AuthContext): string {
  if (!auth.activeWorkspaceId) {
    throw new Error('No active workspace selected');
  }
  return auth.activeWorkspaceId;
}

