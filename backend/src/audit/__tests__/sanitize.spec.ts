import { Decimal } from '../../calculation/decimal';
import { Prisma } from '../../generated/prisma/client';
import { sanitizeForAudit } from '../sanitize';

describe('sanitizeForAudit', () => {
  it('parol va token maydonlari hech qanday chuqurlikda saqlanmaydi', () => {
    const result = sanitizeForAudit({
      username: 'ali',
      passwordHash: '$argon2id$...',
      password: 'p',
      newPassword: 'n',
      currentPassword: 'c',
      accessToken: 't',
      nested: { password_hash: 'h', keep: 1 },
      list: [{ password: 'p', ok: true }],
    });
    expect(result).toEqual({ username: 'ali', nested: { keep: 1 }, list: [{ ok: true }] });
    expect(JSON.stringify(result)).not.toMatch(/argon2|"p"|"n"|"c"|"t"|"h"/);
  });

  it('BigInt → satr (JSON BigInt\'ni bilmaydi, aniqlik yo\'qolmasligi kerak)', () => {
    expect(sanitizeForAudit({ id: 9007199254740993n })).toEqual({ id: '9007199254740993' });
  });

  it('decimal.js va Prisma Decimal → aniq satr (number emas)', () => {
    expect(sanitizeForAudit({ a: new Decimal('2240000.55'), b: new Prisma.Decimal('0.10') })).toEqual({
      a: '2240000.55',
      b: '0.1',
    });
  });

  it('Date → ISO satr', () => {
    expect(sanitizeForAudit({ at: new Date('2026-10-01T05:00:00.000Z') })).toEqual({
      at: '2026-10-01T05:00:00.000Z',
    });
  });

  it('undefined maydonlar tashlab yuboriladi, null saqlanadi', () => {
    expect(sanitizeForAudit({ a: undefined, b: null, c: 'x' })).toEqual({ b: null, c: 'x' });
  });

  it('kirish obyekti o\'zgartirilmaydi', () => {
    const input = { username: 'ali', passwordHash: 'h' };
    sanitizeForAudit(input);
    expect(input).toEqual({ username: 'ali', passwordHash: 'h' });
  });

  it('JSON\'ga aylanmaydigan qiymat (funksiya) — jim tashlanmaydi, xato beradi', () => {
    expect(() => sanitizeForAudit({ fn: () => 1 })).toThrow(/audit/i);
  });
});
