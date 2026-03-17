import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentAuth } from '../auth/current-auth.decorator';
import type { AuthContext } from '../auth/interfaces/auth-context.interface';
import { LicensesService } from './licenses.service';

@Controller('licenses')
@UseGuards(JwtAuthGuard)
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Get('summary')
  async getSummary(@CurrentAuth() auth: AuthContext) {
    return this.licensesService.getSummary(auth.organizationId);
  }
}