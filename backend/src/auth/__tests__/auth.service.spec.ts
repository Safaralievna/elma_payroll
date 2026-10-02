import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuditService } from '../../audit/audit.service';
import { AppError } from '../../common/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../auth.service';

// argon2.verify ni kuzatish uchun (haqiqiy funksiya ishlaydi, faqat chaqiruvlar yoziladi).
jest.mock('argon2', () => {
  const actual = jest.requireActual<typeof import('argon2')>('argon2');
  return { ...actual, verify: jest.fn(actual.verify) };
});
const verifyMock = argon2.verify as jest.MockedFunction<typeof argon2.verify>;

const SECRET = 's'.repeat(32);

describe('AuthService.login', () => {
  const findUnique = jest.fn();
  const prisma = { user: { findUnique } } as unknown as PrismaService;
  const auditLog = jest.fn().mockResolvedValue(undefined);
  const audit = { log: auditLog } as unknown as AuditService;
  const jwt = new JwtService({ secret: SECRET, signOptions: { expiresIn: '8h', algorithm: 'HS256' } });
  const service = new AuthService(prisma, jwt, audit);

  let realHash: string;

  const dbUser = (isActive = true) => ({
    id: 7n,
    username: 'ali',
    passwordHash: realHash,
    isActive,
    employeeId: null,
    employee: null,
    roles: [{ role: { name: 'CALCULATOR' } }],
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  });

  beforeAll(async () => {
    realHash = await argon2.hash('togri-parol');
    await service.onModuleInit();
  });

  beforeEach(() => {
    findUnique.mockReset();
    auditLog.mockClear();
    verifyMock.mockClear();
  });

  async function loginError(username: string, password: string): Promise<AppError> {
    try {
      await service.login({ username, password });
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      return error as AppError;
    }
    throw new Error('login xato bermadi');
  }

  it('to\'g\'ri parol — token (sub = user id) va foydalanuvchi; LOGIN_SUCCESS audit', async () => {
    findUnique.mockResolvedValue(dbUser());
    const result = await service.login({ username: 'ali', password: 'togri-parol' });

    expect(await jwt.verifyAsync(result.accessToken)).toMatchObject({ sub: '7' });
    expect(result.user).toMatchObject({ id: '7', username: 'ali', roles: ['CALCULATOR'] });
    expect(auditLog).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ action: 'LOGIN_SUCCESS', userId: 7n, entityType: 'users', entityId: 7n }),
    );
  });

  it('foydalanuvchi topilmadi — argon2.verify baribir (soxta xesh bilan) chaqiriladi', async () => {
    findUnique.mockResolvedValue(null);
    const error = await loginError('yoq', 'har-qanday');

    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(verifyMock).toHaveBeenCalledTimes(1);
    const [usedHash, usedPassword] = verifyMock.mock.calls[0];
    expect(usedHash).toMatch(/^\$argon2id\$/);
    expect(usedPassword).toBe('har-qanday');
  });

  it('soxta xesh haqiqiy xesh bilan bir xil argon2 parametrlarida (vaqt teng bo\'lishi uchun)', async () => {
    findUnique.mockResolvedValue(null);
    await loginError('yoq', 'x');
    const dummyParams = String(verifyMock.mock.calls[0][0]).split('$').slice(1, 4);
    expect(dummyParams).toEqual(realHash.split('$').slice(1, 4));
  });

  it('noto\'g\'ri parol — topilmagan foydalanuvchi bilan bir xil xato', async () => {
    findUnique.mockResolvedValue(dbUser());
    const wrong = await loginError('ali', 'notogri');
    findUnique.mockResolvedValue(null);
    const unknown = await loginError('yoq', 'notogri');

    expect(wrong.getStatus()).toBe(401);
    expect(wrong.getResponse()).toEqual(unknown.getResponse());
  });

  it('bloklangan foydalanuvchi + noto\'g\'ri parol — INVALID_CREDENTIALS (bloklanganligi oshkor qilinmaydi)', async () => {
    findUnique.mockResolvedValue(dbUser(false));
    expect((await loginError('ali', 'notogri')).code).toBe('INVALID_CREDENTIALS');
  });

  it('bloklangan foydalanuvchi + to\'g\'ri parol — USER_INACTIVE', async () => {
    findUnique.mockResolvedValue(dbUser(false));
    expect((await loginError('ali', 'togri-parol')).code).toBe('USER_INACTIVE');
  });

  it('muvaffaqiyatsiz urinishlar sababi bilan auditga yoziladi, parol yozilmaydi', async () => {
    findUnique.mockResolvedValue(null);
    await loginError('yoq', 'maxfiy-1');
    findUnique.mockResolvedValue(dbUser());
    await loginError('ali', 'maxfiy-2');
    findUnique.mockResolvedValue(dbUser(false));
    await loginError('ali', 'togri-parol');

    const entries = auditLog.mock.calls.map(([, entry]) => entry);
    expect(entries).toEqual([
      expect.objectContaining({ action: 'LOGIN_FAILED', userId: null, entityId: null, newData: { username: 'yoq', reason: 'UNKNOWN_USER' } }),
      expect.objectContaining({ action: 'LOGIN_FAILED', userId: null, entityId: 7n, newData: { username: 'ali', reason: 'WRONG_PASSWORD' } }),
      expect.objectContaining({ action: 'LOGIN_FAILED', userId: null, entityId: 7n, newData: { username: 'ali', reason: 'USER_INACTIVE' } }),
    ]);
    expect(JSON.stringify(entries, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).not.toMatch(
      /maxfiy|togri-parol/,
    );
  });

  it('onModuleInit chaqirilmagan bo\'lsa — jim ishlamaydi, xato beradi', async () => {
    const fresh = new AuthService(prisma, jwt, audit);
    findUnique.mockResolvedValue(null);
    await expect(fresh.login({ username: 'yoq', password: 'x' })).rejects.toThrow(/soxta xesh/);
  });
});
