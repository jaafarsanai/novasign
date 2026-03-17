// src/auth/current-auth.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthContext } from './interfaces/auth-context.interface';

export const CurrentAuth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth;
  },
);

