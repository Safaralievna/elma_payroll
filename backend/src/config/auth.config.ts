import type { StringValue } from 'ms';

export const JWT_SECRET_MIN_LENGTH = 32;
const DEFAULT_JWT_EXPIRES_IN: StringValue = '8h';

export interface AuthConfig {
  jwtSecret: string;
  jwtExpiresIn: StringValue;
}

/**
 * JWT sozlamalarini `.env` dan o'qiydi va tekshiradi.
 * Kalit yo'q yoki qisqa bo'lsa — xato: server zaif kalit bilan ishga tushmasligi kerak.
 */
export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_SECRET o'rnatilmagan (backend/.env ga qarang)");
  }
  if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_SECRET kamida ${JWT_SECRET_MIN_LENGTH} belgi bo'lishi kerak (hozir ${jwtSecret.length})`);
  }

  const expiresIn = env.JWT_EXPIRES_IN ?? DEFAULT_JWT_EXPIRES_IN;
  if (!/^\d+[smhd]$/.test(expiresIn)) {
    throw new Error(`JWT_EXPIRES_IN noto'g'ri: "${expiresIn}" (masalan: 8h, 30m)`);
  }

  return { jwtSecret, jwtExpiresIn: expiresIn as StringValue };
}
