import type { Request } from 'express';

/**
 * Tokenda foydalanuvchi id'si va parol xeshining barmoq izi (`passwordFingerprint`).
 * Rollar har so'rovda bazadan o'qiladi.
 */
export interface JwtPayload {
  sub: string;
  pwd: string;
}

/** JwtAuthGuard so'rovga biriktiradigan joriy foydalanuvchi. */
export interface AuthUser {
  id: bigint;
  username: string;
  roles: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
