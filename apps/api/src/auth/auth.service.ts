import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './interfaces/jwt-payload.interface';
import type { AuthContext } from './interfaces/auth-context.interface';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';
import { safeTimezone } from '../common/timezone.util';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private getJwtSecret(): string {
    return process.env.JWT_SECRET || 'change_this_to_a_long_random_secret';
  }

  private slugify(name: string): string {
    return String(name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 80);
  }

  private async generateUniqueOrganizationSlug(name: string): Promise<string> {
    const base = this.slugify(name) || 'organization';
    let candidate = base;
    let i = 1;

    while (true) {
      const exists = await this.prisma.organization.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });

      if (!exists) return candidate;

      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  private async generateUniqueWorkspaceSlug(
    organizationId: string,
    name: string,
  ): Promise<string> {
    const base = this.slugify(name) || 'workspace';
    let candidate = base;
    let i = 1;

    while (true) {
      const exists = await this.prisma.workspace.findUnique({
        where: {
          organizationId_slug: {
            organizationId,
            slug: candidate,
          },
        },
        select: { id: true },
      });

      if (!exists) return candidate;

      i += 1;
      candidate = `${base}-${i}`;
    }
  }

  signAccessToken(payload: JwtPayload): string {
    return jwt.sign(payload, this.getJwtSecret(), { expiresIn: '7d' });
  }

  async signup(dto: SignupDto) {
    const email = String(dto.email || '').trim().toLowerCase();
    const fullName = String(dto.fullName || '').trim();
    const organizationName = String(dto.organizationName || '').trim();
    const workspaceName = String(dto.workspaceName || '').trim();
    const password = String(dto.password || '');
    const timezone = safeTimezone(String(dto.timezone || '').trim(), 'UTC');

    if (!email || !fullName || !organizationName || !workspaceName || !password) {
      throw new BadRequestException('Missing required signup fields');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      throw new BadRequestException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const organizationSlug = await this.generateUniqueOrganizationSlug(organizationName);

    const result = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
          isActive: true,
          timezone,
        },
      });

      const workspaceSlug = await this.generateUniqueWorkspaceSlug(
        organization.id,
        workspaceName,
      );

      const workspace = await tx.workspace.create({
        data: {
          organizationId: organization.id,
          name: workspaceName,
          slug: workspaceSlug,
          status: 'ACTIVE',
          timezone,
        },
      });

      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          role: 'OWNER',
          isActive: true,
          defaultWorkspaceId: workspace.id,
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          defaultWorkspaceId: true,
        },
      });

      await tx.organizationMembership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: 'ORG_OWNER',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      await tx.workspaceMembership.create({
        data: {
          organizationId: organization.id,
          workspaceId: workspace.id,
          userId: user.id,
          role: 'WORKSPACE_ADMIN',
          status: 'ACTIVE',
          joinedAt: new Date(),
        },
      });

      const startsAt = new Date();
      const expiresAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);

      await tx.license.create({
        data: {
          organizationId: organization.id,
          licenseType: 'TRIAL',
          status: 'ACTIVE',
          planCode: 'trial-7d-2screens',
          startsAt,
          expiresAt,
          trialDays: 7,
          screenQuota: 2,
        },
      });

      return { organization, workspace, user };
    });

    const accessToken = this.signAccessToken({
      sub: result.user.id,
      email: result.user.email,
      organizationId: result.organization.id,
      activeWorkspaceId: result.workspace.id,
    });

    return {
      accessToken,
      user: result.user,
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
        timezone: result.organization.timezone,
      },
      workspace: {
        id: result.workspace.id,
        name: result.workspace.name,
        slug: result.workspace.slug,
        timezone: result.workspace.timezone,
      },
    };
  }

  async login(dto: LoginDto) {
    const email = String(dto.email || '').trim().toLowerCase();
    const password = String(dto.password || '');

    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
        defaultWorkspaceId: true,
        fullName: true,
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid email or password');
    }

    let activeWorkspaceId = user.defaultWorkspaceId ?? null;
    let organizationId: string | null = null;

    if (activeWorkspaceId) {
      const wm = await this.prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: activeWorkspaceId,
            userId: user.id,
          },
        },
        select: {
          status: true,
          organizationId: true,
          workspace: {
            select: {
              status: true,
            },
          },
        },
      });

      if (wm && wm.status === 'ACTIVE' && wm.workspace.status === 'ACTIVE') {
        organizationId = wm.organizationId;
      } else {
        activeWorkspaceId = null;
      }
    }

    if (!organizationId) {
      const firstMembership = await this.prisma.workspaceMembership.findFirst({
        where: {
          userId: user.id,
          status: 'ACTIVE',
          workspace: {
            status: 'ACTIVE',
          },
        },
        orderBy: {
          joinedAt: 'asc',
        },
        select: {
          organizationId: true,
          workspaceId: true,
        },
      });

      if (!firstMembership) {
        throw new ForbiddenException('No active workspace membership found');
      }

      organizationId = firstMembership.organizationId;
      activeWorkspaceId = firstMembership.workspaceId;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { defaultWorkspaceId: activeWorkspaceId },
      });
    }

    const accessToken = this.signAccessToken({
      sub: user.id,
      email: user.email,
      organizationId,
      activeWorkspaceId,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      organizationId,
      activeWorkspaceId,
    };
  }

  async resolveAuthContext(payload: JwtPayload): Promise<AuthContext> {
    const userId = typeof payload?.sub === 'string' ? payload.sub : '';
    const organizationId =
      typeof payload?.organizationId === 'string' ? payload.organizationId : '';
    const activeWorkspaceId =
      typeof payload?.activeWorkspaceId === 'string' ? payload.activeWorkspaceId : null;

    if (!userId) {
      throw new UnauthorizedException('Invalid token payload: missing sub');
    }

    if (!organizationId) {
      throw new UnauthorizedException('Invalid token payload: missing organizationId');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User is inactive or not found');
    }

    const orgMembership = await this.prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId,
        },
      },
      select: {
        role: true,
        status: true,
      },
    });

    if (!orgMembership || orgMembership.status !== 'ACTIVE') {
      throw new ForbiddenException('No active organization membership');
    }

    let workspaceRole: AuthContext['workspaceRole'] = null;

    if (activeWorkspaceId) {
      const workspaceMembership = await this.prisma.workspaceMembership.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: activeWorkspaceId,
            userId,
          },
        },
        select: {
          role: true,
          status: true,
          organizationId: true,
        },
      });

      if (!workspaceMembership || workspaceMembership.status !== 'ACTIVE') {
        throw new ForbiddenException('No active workspace membership');
      }

      if (workspaceMembership.organizationId !== organizationId) {
        throw new ForbiddenException('Workspace does not belong to organization context');
      }

      workspaceRole = workspaceMembership.role as AuthContext['workspaceRole'];
    }

    return {
      userId: user.id,
      email: user.email,
      organizationId,
      activeWorkspaceId,
      organizationRole: orgMembership.role as AuthContext['organizationRole'],
      workspaceRole,
    };
  }

  async getUserAccessibleWorkspaces(userId: string, organizationId: string) {
    return this.prisma.workspaceMembership.findMany({
      where: {
        userId,
        organizationId,
        status: 'ACTIVE',
      },
      select: {
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            timezone: true,
          },
        },
      },
      orderBy: {
        workspace: {
          name: 'asc',
        },
      },
    });
  }

  async switchWorkspace(userId: string, organizationId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMembership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      select: {
        status: true,
        role: true,
        organizationId: true,
        workspace: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        user: {
          select: {
            email: true,
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenException('No active membership for target workspace');
    }

    if (membership.organizationId !== organizationId) {
      throw new ForbiddenException('Target workspace is outside current organization');
    }

    if (membership.workspace.status !== 'ACTIVE') {
      throw new ForbiddenException('Target workspace is not active');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        defaultWorkspaceId: workspaceId,
      },
    });

    const accessToken = this.signAccessToken({
      sub: userId,
      email: membership.user.email,
      organizationId,
      activeWorkspaceId: workspaceId,
    });

    return {
      workspaceId: membership.workspace.id,
      workspaceName: membership.workspace.name,
      accessToken,
    };
  }
}