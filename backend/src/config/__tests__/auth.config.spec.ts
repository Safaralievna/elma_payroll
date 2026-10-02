import { loadAuthConfig } from '../auth.config';

const SECRET_32 = 'a'.repeat(32);

describe('loadAuthConfig', () => {
  it('JWT_SECRET berilmasa — xato (server ishga tushmaydi)', () => {
    expect(() => loadAuthConfig({})).toThrow(/JWT_SECRET/);
  });

  it('JWT_SECRET 32 belgidan qisqa bo\'lsa — xato', () => {
    expect(() => loadAuthConfig({ JWT_SECRET: 'a'.repeat(31) })).toThrow(/kamida 32/);
  });

  it('JWT_SECRET 32 belgi — qabul qilinadi; muddat standart 8h', () => {
    expect(loadAuthConfig({ JWT_SECRET: SECRET_32 })).toEqual({
      jwtSecret: SECRET_32,
      jwtExpiresIn: '8h',
    });
  });

  it('JWT_EXPIRES_IN berilsa — o\'sha ishlatiladi', () => {
    expect(loadAuthConfig({ JWT_SECRET: SECRET_32, JWT_EXPIRES_IN: '30m' }).jwtExpiresIn).toBe('30m');
  });

  it('JWT_EXPIRES_IN noto\'g\'ri formatda bo\'lsa — xato', () => {
    expect(() => loadAuthConfig({ JWT_SECRET: SECRET_32, JWT_EXPIRES_IN: '8 soat' })).toThrow(/JWT_EXPIRES_IN/);
  });
});
