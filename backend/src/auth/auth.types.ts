import type { Request } from 'express';

/** Tokenda faqat foydalanuvchi id'si. Rollar har so'rovda bazadan o'qiladi. */
export interface JwtPayload {
  sub: string;
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
