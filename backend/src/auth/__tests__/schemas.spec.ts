import { auditQuerySchema } from '../../audit/audit.schemas';
import { createUserSchema, resetPasswordSchema, updateUserSchema } from '../../users/users.schemas';
import { idParamSchema } from '../../common/zod-validation.pipe';
import { changePasswordSchema, loginSchema } from '../auth.schemas';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(true);
const bad = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  expect(schema.safeParse(value).success).toBe(false);

describe('loginSchema', () => {
  it('username bo\'sh joylardan tozalanadi', () => {
    expect(loginSchema.parse({ username: '  admin ', password: 'x' })).toEqual({ username: 'admin', password: 'x' });
  });

  it('bo\'sh username yoki parol — rad', () => {
    bad(loginSchema, { username: '   ', password: 'x' });
    bad(loginSchema, { username: 'admin', password: '' });
  });

  it('parol 128 belgidan uzun — rad (argon2 ni sekinlashtirmaslik uchun)', () => {
    ok(loginSchema, { username: 'admin', password: 'a'.repeat(128) });
    bad(loginSchema, { username: 'admin', password: 'a'.repeat(129) });
  });

  it('ortiqcha maydon — rad', () => {
    bad(loginSchema, { username: 'admin', password: 'x', role: 'ADMIN' });
  });
});

describe('yangi parol talabi: 8–128 belgi', () => {
  it('changePasswordSchema', () => {
    bad(changePasswordSchema, { currentPassword: 'old', newPassword: 'a'.repeat(7) });
    ok(changePasswordSchema, { currentPassword: 'old', newPassword: 'a'.repeat(8) });
    ok(changePasswordSchema, { currentPassword: 'old', newPassword: 'a'.repeat(128) });
    bad(changePasswordSchema, { currentPassword: 'old', newPassword: 'a'.repeat(129) });
  });

  it('resetPasswordSchema', () => {
    bad(resetPasswordSchema, { newPassword: 'a'.repeat(7) });
    ok(resetPasswordSchema, { newPassword: 'a'.repeat(8) });
    bad(resetPasswordSchema, { newPassword: 'a'.repeat(129) });
  });
});

describe('createUserSchema', () => {
  const valid = { username: 'kassir1', password: 'a'.repeat(8), roles: ['CALCULATOR'] };

  it('to\'g\'ri ma\'lumot; employeeCode ixtiyoriy', () => {
    ok(createUserSchema, valid);
    ok(createUserSchema, { ...valid, employeeCode: 'SV-001' });
    ok(createUserSchema, { ...valid, employeeCode: null });
  });

  it('qisqa parol — rad', () => {
    bad(createUserSchema, { ...valid, password: 'short' });
  });

  it('noma\'lum rol yoki rolsiz — rad', () => {
    bad(createUserSchema, { ...valid, roles: ['SUPERUSER'] });
    bad(createUserSchema, { ...valid, roles: [] });
  });

  it('takrorlangan rollar bitta qilib olinadi', () => {
    expect(createUserSchema.parse({ ...valid, roles: ['ADMIN', 'ADMIN'] }).roles).toEqual(['ADMIN']);
  });
});

describe('updateUserSchema', () => {
  it('kamida bitta maydon kerak', () => {
    bad(updateUserSchema, {});
    ok(updateUserSchema, { isActive: false });
    ok(updateUserSchema, { roles: ['APPROVER'] });
    ok(updateUserSchema, { employeeCode: null });
  });

  it('parolni bu yerdan o\'zgartirib bo\'lmaydi', () => {
    bad(updateUserSchema, { password: 'a'.repeat(8) });
  });
});

describe('idParamSchema', () => {
  it('raqamli satr → BigInt', () => {
    expect(idParamSchema.parse('42')).toBe(42n);
  });

  it('raqam bo\'lmagan, manfiy yoki juda uzun — rad', () => {
    bad(idParamSchema, 'abc');
    bad(idParamSchema, '-1');
    bad(idParamSchema, '1'.repeat(19));
  });
});

describe('auditQuerySchema', () => {
  it('standart sahifalash', () => {
    expect(auditQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
  });

  it('filtrlar turga aylantiriladi', () => {
    expect(
      auditQuerySchema.parse({ entityType: 'users', entityId: '5', userId: '1', from: '2026-10-01', page: '2' }),
    ).toEqual({
      entityType: 'users',
      entityId: 5n,
      userId: 1n,
      from: new Date('2026-10-01'),
      page: 2,
      pageSize: 50,
    });
  });

  it('pageSize 200 dan katta yoki noto\'g\'ri sana — rad', () => {
    bad(auditQuerySchema, { pageSize: '201' });
    bad(auditQuerySchema, { from: 'kecha' });
  });

  it('noma\'lum filtr — rad (xato yozilgan filtr jim e\'tiborsiz qolmasin)', () => {
    bad(auditQuerySchema, { entity: 'users' });
  });
});
