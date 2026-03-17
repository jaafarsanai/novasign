import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  private getJwtSecret(): string {
    return process.env.JWT_SECRET || 'change_this_to_a_long_random_secret';
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers.authorization;
    const bearerToken =
      authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const cookieToken =
      request.cookies?.pp_access_token ||
      request.cookies?.accessToken ||
      null;

    const token = bearerToken || cookieToken;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    let payload: any;
    try {
      payload = jwt.verify(token, this.getJwtSecret());
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    if (!payload || typeof payload !== 'object') {
      throw new UnauthorizedException('Invalid token payload');
    }

    if (typeof payload.sub !== 'string' || !payload.sub.trim()) {
      throw new UnauthorizedException('Invalid token payload: missing sub');
    }

    if (
      typeof payload.organizationId !== 'string' ||
      !payload.organizationId.trim()
    ) {
      throw new UnauthorizedException(
        'Invalid token payload: missing organizationId',
      );
    }

    request.user = payload;
    request.auth = await this.authService.resolveAuthContext(payload);

    return true;
  }
}