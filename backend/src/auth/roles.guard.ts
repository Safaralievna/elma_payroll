import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../common/app-error';
import { RoleName, ROLES_KEY } from './auth.constants';
import { AuthenticatedRequest } from './auth.types';

/**
 * Global guard, JwtAuthGuard'dan keyin ishlaydi. `@Roles(...)` bo'lsa —
 * foydalanuvchida ulardan kamida bittasi bo'lishi shart, aks holda 403.
 * `@Roles` yo'q endpoint — tizimga kirgan har kimga ochiq.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', 'Tizimga kirilmagan');
    }
    if (!required.some((role) => user.roles.includes(role))) {
      throw new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', "Bu amal uchun ruxsat yo'q", { requiredRoles: required });
    }
    return true;
  }
}
