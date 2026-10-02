import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthUser } from '../auth.types';
import { Public, Roles } from '../decorators';
import { JwtAuthGuard } from '../jwt-auth.guard';
import { RolesGuard } from '../roles.guard';

const SECRET = 's'.repeat(32);

class TestController {
  @Public()
  open(): void {}

  @Roles('ADMIN')
  adminOnly(): void {}

  @Roles('ADMIN', 'APPROVER')
  adminOrApprover(): void {}

  anyLoggedIn(): void {}
}

type Handler = keyof TestController;

function contextFor(handler: Handler, request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => TestController.prototype[handler],
    getClass: () => TestController,
  } as unknown as ExecutionContext;
}

async function expectAppError(promise: Promise<unknown> | (() => unknown), status: number, code: string) {
  let caught: unknown;
  try {
    await (typeof promise === 'function' ? promise() : promise);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  expect((caught as AppError).getStatus()).toBe(status);
  expect((caught as AppError).code).toBe(code);
}

describe('JwtAuthGuard', () => {
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h', algorithm: 'HS256' } });
  const findUnique = jest.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const guard = new JwtAuthGuard(new Reflector(), jwt, prisma);

  const dbUser = (overrides: Partial<{ isActive: boolean }> = {}) => ({
    id: 7n,
    username: 'ali',
    isActive: true,
    roles: [{ role: { name: 'CALCULATOR' } }],
    ...overrides,
  });

  beforeEach(() => findUnique.mockReset());

  it('@Public() endpoint — tokensiz o\'tadi, bazaga murojaat yo\'q', async () => {
    await expect(guard.canActivate(contextFor('open', { headers: {} }))).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('token yo\'q — 401 UNAUTHORIZED', async () => {
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', { headers: {} })), 401, 'UNAUTHORIZED');
  });

  it('Bearer bo\'lmagan sarlavha — 401', async () => {
    const request = { headers: { authorization: 'Basic abc' } };
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', request)), 401, 'UNAUTHORIZED');
  });

  it('buzilgan token — 401', async () => {
    const request = { headers: { authorization: 'Bearer not.a.jwt' } };
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', request)), 401, 'UNAUTHORIZED');
  });

  it('boshqa kalit bilan imzolangan token — 401', async () => {
    const forged = await new JwtService({ secret: 'x'.repeat(32) }).signAsync({ sub: '7' });
    const request = { headers: { authorization: `Bearer ${forged}` } };
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', request)), 401, 'UNAUTHORIZED');
  });

  it('muddati o\'tgan token — 401', async () => {
    const expired = await new JwtService({ secret: SECRET }).signAsync({
      sub: '7',
      exp: Math.floor(Date.now() / 1000) - 60,
    });
    const request = { headers: { authorization: `Bearer ${expired}` } };
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', request)), 401, 'UNAUTHORIZED');
  });

  it('foydalanuvchi bazada yo\'q — 401', async () => {
    findUnique.mockResolvedValue(null);
    const token = await jwt.signAsync({ sub: '7' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', request)), 401, 'UNAUTHORIZED');
  });

  it('foydalanuvchi bloklangan — 401 USER_INACTIVE (token hali amal qilsa ham)', async () => {
    findUnique.mockResolvedValue(dbUser({ isActive: false }));
    const token = await jwt.signAsync({ sub: '7' });
    const request = { headers: { authorization: `Bearer ${token}` } };
    await expectAppError(guard.canActivate(contextFor('anyLoggedIn', request)), 401, 'USER_INACTIVE');
  });

  it('yaroqli token — req.user bazadagi joriy rollar bilan to\'ldiriladi', async () => {
    findUnique.mockResolvedValue(dbUser());
    const token = await jwt.signAsync({ sub: '7' });
    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    await expect(guard.canActivate(contextFor('anyLoggedIn', request))).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7n } }));
    expect(request.user).toEqual<AuthUser>({ id: 7n, username: 'ali', roles: ['CALCULATOR'] });
  });
});

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());
  const user = (roles: string[]): AuthUser => ({ id: 1n, username: 'u', roles });

  it('@Roles yo\'q — tizimga kirgan har kim o\'tadi', () => {
    expect(guard.canActivate(contextFor('anyLoggedIn', { user: user([]) }))).toBe(true);
  });

  it('kerakli rol bor — o\'tadi', () => {
    expect(guard.canActivate(contextFor('adminOnly', { user: user(['ADMIN']) }))).toBe(true);
  });

  it('bir nechta roldan bittasi yetarli', () => {
    expect(guard.canActivate(contextFor('adminOrApprover', { user: user(['APPROVER']) }))).toBe(true);
  });

  it('rol yetarli emas — 403 FORBIDDEN', async () => {
    await expectAppError(
      () => guard.canActivate(contextFor('adminOnly', { user: user(['CALCULATOR', 'APPROVER']) })),
      403,
      'FORBIDDEN',
    );
  });

  it('req.user yo\'q (JwtAuthGuard ishlamagan) — jim o\'tkazilmaydi, 401', async () => {
    await expectAppError(() => guard.canActivate(contextFor('adminOnly', {})), 401, 'UNAUTHORIZED');
  });
});
