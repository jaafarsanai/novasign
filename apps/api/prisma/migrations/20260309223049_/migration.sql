/*
  Warnings:

  - A unique constraint covering the columns `[organizationId,workspaceId,parentId,name]` on the table `MediaFolder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[playlistId,order]` on the table `PlaylistItem` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "OrganizationRole" AS ENUM ('ORG_OWNER', 'ORG_ADMIN', 'ORG_AUDITOR', 'MEMBER');

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('WORKSPACE_ADMIN', 'CONTENT_MANAGER', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'TRIAL', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MediaVisibilityScope" AS ENUM ('GLOBAL', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "MediaOwnerType" AS ENUM ('ORGANIZATION', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'USER_INVITED', 'USER_INVITE_RESENT', 'USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_UPDATED', 'ORGANIZATION_UPDATED', 'WORKSPACE_CREATED', 'WORKSPACE_UPDATED', 'WORKSPACE_ARCHIVED', 'WORKSPACE_MEMBER_ADDED', 'WORKSPACE_MEMBER_REMOVED', 'WORKSPACE_ROLE_CHANGED', 'SCREEN_CREATED', 'SCREEN_UPDATED', 'SCREEN_ARCHIVED', 'SCREEN_PAIRED', 'SCREEN_UNPAIRED', 'SCREEN_MOVED_WORKSPACE', 'SCREEN_ASSIGNED_CONTENT', 'PLAYLIST_CREATED', 'PLAYLIST_UPDATED', 'PLAYLIST_DELETED', 'CHANNEL_CREATED', 'CHANNEL_UPDATED', 'CHANNEL_DELETED', 'MEDIA_CREATED', 'MEDIA_UPDATED', 'MEDIA_DELETED', 'MEDIA_MOVED', 'FOLDER_CREATED', 'FOLDER_UPDATED', 'FOLDER_DELETED', 'LICENSE_CREATED', 'LICENSE_UPDATED');

-- CreateEnum
CREATE TYPE "NotificationEventType" AS ENUM ('SCREEN_OFFLINE', 'SCREEN_ONLINE', 'LICENSE_THRESHOLD');

-- DropIndex
DROP INDEX "MediaFolder_parentId_name_key";

-- AlterTable
ALTER TABLE "Channel" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "License" ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "screenQuota" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "ownerType" "MediaOwnerType",
ADD COLUMN     "visibilityScope" "MediaVisibilityScope",
ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "MediaFolder" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "ownerType" "MediaOwnerType",
ADD COLUMN     "visibilityScope" "MediaVisibilityScope",
ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Screen" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "defaultWorkspaceId" TEXT,
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "jobFunction" TEXT,
ADD COLUMN     "jobTitle" TEXT,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastName" TEXT;

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "OrganizationRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" TEXT,
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMembership" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedByUserId" TEXT,
    "invitedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenGroup" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScreenGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreenGroupMember" (
    "id" TEXT NOT NULL,
    "screenGroupId" TEXT NOT NULL,
    "screenId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreenGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationRecipient" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "screenGroupId" TEXT,
    "eventType" "NotificationEventType" NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityLabel" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_isActive_idx" ON "Organization"("isActive");

-- CreateIndex
CREATE INDEX "Workspace_organizationId_idx" ON "Workspace"("organizationId");

-- CreateIndex
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_slug_key" ON "Workspace"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_organizationId_name_key" ON "Workspace"("organizationId", "name");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_idx" ON "OrganizationMembership"("organizationId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");

-- CreateIndex
CREATE INDEX "OrganizationMembership_role_idx" ON "OrganizationMembership"("role");

-- CreateIndex
CREATE INDEX "OrganizationMembership_status_idx" ON "OrganizationMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_organizationId_userId_key" ON "OrganizationMembership"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_organizationId_idx" ON "WorkspaceMembership"("organizationId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_workspaceId_idx" ON "WorkspaceMembership"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_userId_idx" ON "WorkspaceMembership"("userId");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_role_idx" ON "WorkspaceMembership"("role");

-- CreateIndex
CREATE INDEX "WorkspaceMembership_status_idx" ON "WorkspaceMembership"("status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMembership_workspaceId_userId_key" ON "WorkspaceMembership"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ScreenGroup_organizationId_idx" ON "ScreenGroup"("organizationId");

-- CreateIndex
CREATE INDEX "ScreenGroup_workspaceId_idx" ON "ScreenGroup"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenGroup_workspaceId_name_key" ON "ScreenGroup"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ScreenGroupMember_screenGroupId_idx" ON "ScreenGroupMember"("screenGroupId");

-- CreateIndex
CREATE INDEX "ScreenGroupMember_screenId_idx" ON "ScreenGroupMember"("screenId");

-- CreateIndex
CREATE UNIQUE INDEX "ScreenGroupMember_screenGroupId_screenId_key" ON "ScreenGroupMember"("screenGroupId", "screenId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_organizationId_idx" ON "NotificationRecipient"("organizationId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_workspaceId_idx" ON "NotificationRecipient"("workspaceId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_screenGroupId_idx" ON "NotificationRecipient"("screenGroupId");

-- CreateIndex
CREATE INDEX "NotificationRecipient_eventType_idx" ON "NotificationRecipient"("eventType");

-- CreateIndex
CREATE INDEX "NotificationRecipient_email_idx" ON "NotificationRecipient"("email");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_idx" ON "AuditLog"("workspaceId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_idx" ON "AuditLog"("entityType");

-- CreateIndex
CREATE INDEX "AuditLog_entityId_idx" ON "AuditLog"("entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Channel_organizationId_idx" ON "Channel"("organizationId");

-- CreateIndex
CREATE INDEX "Channel_workspaceId_idx" ON "Channel"("workspaceId");

-- CreateIndex
CREATE INDEX "Channel_isArchived_idx" ON "Channel"("isArchived");

-- CreateIndex
CREATE INDEX "License_organizationId_idx" ON "License"("organizationId");

-- CreateIndex
CREATE INDEX "License_status_idx" ON "License"("status");

-- CreateIndex
CREATE INDEX "Media_organizationId_idx" ON "Media"("organizationId");

-- CreateIndex
CREATE INDEX "Media_workspaceId_idx" ON "Media"("workspaceId");

-- CreateIndex
CREATE INDEX "Media_visibilityScope_idx" ON "Media"("visibilityScope");

-- CreateIndex
CREATE INDEX "Media_ownerType_idx" ON "Media"("ownerType");

-- CreateIndex
CREATE INDEX "MediaFolder_organizationId_idx" ON "MediaFolder"("organizationId");

-- CreateIndex
CREATE INDEX "MediaFolder_workspaceId_idx" ON "MediaFolder"("workspaceId");

-- CreateIndex
CREATE INDEX "MediaFolder_visibilityScope_idx" ON "MediaFolder"("visibilityScope");

-- CreateIndex
CREATE INDEX "MediaFolder_ownerType_idx" ON "MediaFolder"("ownerType");

-- CreateIndex
CREATE UNIQUE INDEX "MediaFolder_organizationId_workspaceId_parentId_name_key" ON "MediaFolder"("organizationId", "workspaceId", "parentId", "name");

-- CreateIndex
CREATE INDEX "Playlist_organizationId_idx" ON "Playlist"("organizationId");

-- CreateIndex
CREATE INDEX "Playlist_workspaceId_idx" ON "Playlist"("workspaceId");

-- CreateIndex
CREATE INDEX "Playlist_isArchived_idx" ON "Playlist"("isArchived");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistItem_playlistId_order_key" ON "PlaylistItem"("playlistId", "order");

-- CreateIndex
CREATE INDEX "Screen_organizationId_idx" ON "Screen"("organizationId");

-- CreateIndex
CREATE INDEX "Screen_workspaceId_idx" ON "Screen"("workspaceId");

-- CreateIndex
CREATE INDEX "Screen_isArchived_idx" ON "Screen"("isArchived");

-- CreateIndex
CREATE INDEX "Screen_pairedAt_idx" ON "Screen"("pairedAt");

-- CreateIndex
CREATE INDEX "User_defaultWorkspaceId_idx" ON "User"("defaultWorkspaceId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMembership" ADD CONSTRAINT "WorkspaceMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultWorkspaceId_fkey" FOREIGN KEY ("defaultWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaFolder" ADD CONSTRAINT "MediaFolder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Media" ADD CONSTRAINT "Media_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screen" ADD CONSTRAINT "Screen_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenGroup" ADD CONSTRAINT "ScreenGroup_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenGroup" ADD CONSTRAINT "ScreenGroup_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenGroupMember" ADD CONSTRAINT "ScreenGroupMember_screenGroupId_fkey" FOREIGN KEY ("screenGroupId") REFERENCES "ScreenGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreenGroupMember" ADD CONSTRAINT "ScreenGroupMember_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationRecipient" ADD CONSTRAINT "NotificationRecipient_screenGroupId_fkey" FOREIGN KEY ("screenGroupId") REFERENCES "ScreenGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
