import { createParamDecorator, ExecutionContext, HttpStatus, SetMetadata } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { IS_PUBLIC_KEY, RoleName, ROLES_KEY } from './auth.constants';
import { AuthenticatedRequest, AuthUser } from './auth.types';

/** Tokensiz ochiq endpoint (masalan, login). Qolganlari standart bo'yicha himoyalangan. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Kerakli rollar — ulardan kamida bittasi bo'lishi kerak. */
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

/** Kontrollerda joriy foydalanuvchi: `@CurrentUser() user: AuthUser`. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AuthenticatedRequest>().user;
  if (!user) {
    throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Tizimga kirilmagan');
  }
  return user;
});
