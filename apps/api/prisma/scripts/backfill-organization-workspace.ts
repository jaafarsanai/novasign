const {
  PrismaClient,
} = require('@prisma/client');

const prisma = new PrismaClient();

const DRY_RUN = String(process.env.DRY_RUN || 'true').toLowerCase() === 'true';

function mapLegacyOrgRole(role) {
  switch ((role || '').toUpperCase()) {
    case 'OWNER':
      return 'ORG_OWNER';
    case 'ADMIN':
      return 'ORG_ADMIN';
    case 'AUDITOR':
      return 'ORG_AUDITOR';
    default:
      return 'MEMBER';
  }
}

function mapLegacyWorkspaceRole(role) {
  switch ((role || '').toUpperCase()) {
    case 'OWNER':
    case 'ADMIN':
      return 'WORKSPACE_ADMIN';
    case 'EDITOR':
      return 'EDITOR';
    case 'VIEWER':
      return 'VIEWER';
    default:
      return 'WORKSPACE_ADMIN';
  }
}

async function main() {
  console.log(`DRY_RUN=${DRY_RUN}`);

  let defaultOrg;
  let mainWorkspace;

  if (!DRY_RUN) {
    defaultOrg = await prisma.organization.upsert({
      where: { slug: 'default-organization' },
      update: {},
      create: {
        name: 'Default Organization',
        slug: 'default-organization',
        isActive: true,
      },
    });

    mainWorkspace = await prisma.workspace.upsert({
      where: {
        organizationId_slug: {
          organizationId: defaultOrg.id,
          slug: 'main-workspace',
        },
      },
      update: {},
      create: {
        organizationId: defaultOrg.id,
        name: 'Main Workspace',
        slug: 'main-workspace',
        status: 'ACTIVE',
      },
    });
  } else {
    defaultOrg = await prisma.organization.findUnique({
      where: { slug: 'default-organization' },
    });

    if (!defaultOrg) {
      console.log('[DRY RUN] Would create organization: default-organization');
      defaultOrg = { id: 'DRY_ORG_ID', slug: 'default-organization' };
    }

    if (defaultOrg.id !== 'DRY_ORG_ID') {
      mainWorkspace = await prisma.workspace.findUnique({
        where: {
          organizationId_slug: {
            organizationId: defaultOrg.id,
            slug: 'main-workspace',
          },
        },
      });
    }

    if (!mainWorkspace) {
      console.log('[DRY RUN] Would create workspace: main-workspace');
      mainWorkspace = { id: 'DRY_WS_ID', organizationId: defaultOrg.id };
    }
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${users.length} users`);

  for (let i = 0; i < users.length; i++) {
    const user = users[i];

    const orgRole =
      i === 0 && (!user.role || user.role === 'OWNER')
        ? 'ORG_OWNER'
        : mapLegacyOrgRole(user.role);

    const workspaceRole =
      i === 0 && (!user.role || user.role === 'OWNER')
        ? 'WORKSPACE_ADMIN'
        : mapLegacyWorkspaceRole(user.role);

    if (DRY_RUN) {
      console.log(
        `[DRY RUN] User ${user.email}: orgRole=${orgRole}, workspaceRole=${workspaceRole}, defaultWorkspaceId=${user.defaultWorkspaceId || 'NULL'}`
      );
      continue;
    }

    await prisma.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: defaultOrg.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        organizationId: defaultOrg.id,
        userId: user.id,
        role: orgRole,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    await prisma.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: mainWorkspace.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        organizationId: defaultOrg.id,
        workspaceId: mainWorkspace.id,
        userId: user.id,
        role: workspaceRole,
        status: 'ACTIVE',
        joinedAt: new Date(),
      },
    });

    if (!user.defaultWorkspaceId) {
      await prisma.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: mainWorkspace.id },
      });
    }
  }

  if (DRY_RUN) {
    console.log('[DRY RUN] Would update License.organizationId where null');
    console.log('[DRY RUN] Would update Screen ownership where null');
    console.log('[DRY RUN] Would update Playlist ownership where null');
    console.log('[DRY RUN] Would update Channel ownership where null');
    console.log('[DRY RUN] Would update MediaFolder ownership where null');
    console.log('[DRY RUN] Would update Media ownership where null');
  } else {
    await prisma.license.updateMany({
      where: { organizationId: null },
      data: { organizationId: defaultOrg.id },
    });

    await prisma.screen.updateMany({
      where: {
        OR: [{ organizationId: null }, { workspaceId: null }],
      },
      data: {
        organizationId: defaultOrg.id,
        workspaceId: mainWorkspace.id,
        isArchived: false,
      },
    });

    await prisma.playlist.updateMany({
      where: {
        OR: [{ organizationId: null }, { workspaceId: null }],
      },
      data: {
        organizationId: defaultOrg.id,
        workspaceId: mainWorkspace.id,
        isArchived: false,
      },
    });

    await prisma.channel.updateMany({
      where: {
        OR: [{ organizationId: null }, { workspaceId: null }],
      },
      data: {
        organizationId: defaultOrg.id,
        workspaceId: mainWorkspace.id,
        isArchived: false,
      },
    });

    await prisma.mediaFolder.updateMany({
      where: {
        OR: [
          { organizationId: null },
          { workspaceId: null },
          { visibilityScope: null },
          { ownerType: null },
        ],
      },
      data: {
        organizationId: defaultOrg.id,
        workspaceId: mainWorkspace.id,
        visibilityScope: 'WORKSPACE',
        ownerType: 'WORKSPACE',
      },
    });

    await prisma.media.updateMany({
      where: {
        OR: [
          { organizationId: null },
          { workspaceId: null },
          { visibilityScope: null },
          { ownerType: null },
        ],
      },
      data: {
        organizationId: defaultOrg.id,
        workspaceId: mainWorkspace.id,
        visibilityScope: 'WORKSPACE',
        ownerType: 'WORKSPACE',
      },
    });
  }

  console.log('Backfill completed');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });