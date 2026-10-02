import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { hash } from 'argon2';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { RoleName } from '../../src/auth/auth.constants';
import { JwtPayload } from '../../src/auth/auth.types';
import { passwordFingerprint } from '../../src/auth/password-fingerprint';
import { PrismaService } from '../../src/prisma/prisma.service';
import { e2eDatabaseUrl } from './db-helpers';

/** E2E testlar uchun muhit: alohida E2E bazasi va test JWT kaliti. */
export function useTestEnv(): void {
  process.env.DATABASE_URL = e2eDatabaseUrl();
  process.env.JWT_SECRET = 'e2e-test-secret-'.repeat(3);
  process.env.JWT_EXPIRES_IN = '8h';
}

/**
 * To'liq ilova (AppModule) — main.ts dagi bilan bir xil sozlamalar.
 * Har bir chaqiruv yangi nusxa: login cheklovi hisoblagichi ham yangidan boshlanadi.
 */
export async function createTestApp(): Promise<INestApplication> {
  useTestEnv();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}

/**
 * Login'ni chetlab o'tib token yaratadi (login cheklovini sarflamaslik uchun).
 * Parol izi bazadagi joriy xeshdan olinadi — xuddi login'dagidek.
 */
export async function tokenFor(app: INestApplication, userId: bigint): Promise<string> {
  const user = await app.get(PrismaService).user.findUniqueOrThrow({ where: { id: userId } });
  const payload: JwtPayload = { sub: userId.toString(), pwd: passwordFingerprint(user.passwordHash) };
  return app.get(JwtService).sign(payload);
}

export async function ensureRoles(prisma: PrismaService): Promise<void> {
  for (const name of ['ADMIN', 'CALCULATOR', 'APPROVER']) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }
}

let counter = 0;
/** Fayllar orasida to'qnashmaydigan username. */
export function uniqueName(prefix: string): string {
  counter += 1;
  return `${prefix}_${process.pid}_${Date.now()}_${counter}`;
}

export async function createUser(
  prisma: PrismaService,
  options: { username?: string; password?: string; roles?: RoleName[]; isActive?: boolean } = {},
): Promise<{ id: bigint; username: string; password: string }> {
  const username = options.username ?? uniqueName('user');
  const password = options.password ?? 'parol-12345';
  const roles = await prisma.role.findMany({ where: { name: { in: options.roles ?? [] } } });
  const user = await prisma.user.create({
    data: {
      username,
      passwordHash: await hash(password),
      isActive: options.isActive ?? true,
      roles: { create: roles.map((role) => ({ roleId: role.id })) },
    },
  });
  return { id: user.id, username, password };
}
