import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentAuth } from './current-auth.decorator';
import type { AuthContext } from './interfaces/auth-context.interface';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { SwitchWorkspaceDto } from './dto/switch-workspace.dto';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('logout')
  async logout() {
    return { ok: true };
  }

  @Get('me')
@UseGuards(JwtAuthGuard)
async getMe(@CurrentAuth() auth: AuthContext) {
  const user = await this.prisma.user.findUnique({
    where: { id: auth.userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      defaultWorkspaceId: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const organization = await this.prisma.organization.findUnique({
    where: { id: auth.organizationId },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const workspaces = await this.authService.getUserAccessibleWorkspaces(
    auth.userId,
    auth.organizationId,
  );

  return {
    user,
    organization,
    auth,
    workspaces: workspaces.map((item) => ({
      ...item.workspace,
      role: item.role,
    })),
  };
}

  @Post('switch-workspace')
  @UseGuards(JwtAuthGuard)
  async switchWorkspace(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: SwitchWorkspaceDto,
  ) {
    const result = await this.authService.switchWorkspace(
      auth.userId,
      auth.organizationId,
      dto.workspaceId,
    );

    return {
      message: 'Workspace switched successfully',
      ...result,
    };
  }
}