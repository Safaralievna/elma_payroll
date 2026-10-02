/**
 * 3-bosqich E2E: auth, rollar, foydalanuvchilar, audit — haqiqiy test bazasida, HTTP orqali.
 *
 * Test bazasi har `npm run test:db` da noldan yaratiladi (global-setup). Bu fayl
 * yaratgan yozuvlar qoladi (audit_logs ni o'chirib bo'lmaydi), shuning uchun
 * username'lar noyob. Bazadagi yagona ADMIN — shu fayl yaratadigan `admin`.
 */
import { INestApplication, Logger } from '@nestjs/common';
import request from 'supertest';
import { AuditService } from '../../src/audit/audit.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, createUser, ensureRoles, tokenFor, uniqueName, useTestEnv } from './app-helpers';

type TestUser = { id: bigint; username: string; password: string };

let prisma: PrismaService;
let admin: TestUser;

beforeAll(async () => {
  useTestEnv();
  prisma = new PrismaService();
  await prisma.onModuleInit();
  await ensureRoles(prisma);
  admin = await createUser(prisma, { username: uniqueName('admin'), roles: ['ADMIN'] });
});

afterAll(async () => {
  await prisma.onModuleDestroy();
});

/** Audit qatorlarini matnga aylantiradi (BigInt id'lar bilan) — ichida parol yo'qligini tekshirish uchun. */
function jsonOf(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => (typeof item === 'bigint' ? item.toString() : item));
}

function auditRows(action: string, entityId?: bigint) {
  return prisma.auditLog.findMany({ where: { action, ...(entityId ? { entityId } : {}) }, orderBy: { id: 'asc' } });
}

function useApp(): () => INestApplication {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  return () => app;
}

// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  const app = useApp();
  let calculator: TestUser;
  let blocked: TestUser;

  beforeAll(async () => {
    calculator = await createUser(prisma, { roles: ['CALCULATOR'] });
    blocked = await createUser(prisma, { roles: ['CALCULATOR'], isActive: false });
  });

  it('to\'g\'ri parol → token; token bilan /auth/me ishlaydi; LOGIN_SUCCESS audit', async () => {
    const res = await request(app().getHttpServer())
      .post('/api/auth/login')
      .send({ username: calculator.username, password: calculator.password })
      .expect(200);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ id: calculator.id.toString(), username: calculator.username, roles: ['CALCULATOR'] });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

    const me = await request(app().getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ username: calculator.username, roles: ['CALCULATOR'], isActive: true });

    const rows = await auditRows('LOGIN_SUCCESS', calculator.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(calculator.id);
  });

  it('noto\'g\'ri parol → 401 INVALID_CREDENTIALS; LOGIN_FAILED audit (parolsiz)', async () => {
    const res = await request(app().getHttpServer())
      .post('/api/auth/login')
      .send({ username: calculator.username, password: 'notogri-parol' })
      .expect(401);
    expect(res.body).toEqual({ code: 'INVALID_CREDENTIALS', message: expect.any(String) });

    const rows = await auditRows('LOGIN_FAILED', calculator.id);
    expect(rows.at(-1)?.newData).toEqual({ username: calculator.username, reason: 'WRONG_PASSWORD' });
    expect(jsonOf(rows)).not.toContain('notogri-parol');
  });

  it('mavjud bo\'lmagan foydalanuvchi → xuddi shu 401 INVALID_CREDENTIALS', async () => {
    const res = await request(app().getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'bunday_foydalanuvchi_yoq', password: 'x' })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('bloklangan foydalanuvchi (to\'g\'ri parol) → 401 USER_INACTIVE', async () => {
    const res = await request(app().getHttpServer())
      .post('/api/auth/login')
      .send({ username: blocked.username, password: blocked.password })
      .expect(401);
    expect(res.body.code).toBe('USER_INACTIVE');
  });
});

// ---------------------------------------------------------------------------

describe('Login urinishlari cheklovi (IP bo\'yicha daqiqasiga 5 ta)', () => {
  const app = useApp();

  it('6-urinish → 429 TOO_MANY_ATTEMPTS; boshqa endpointlar cheklanmaydi', async () => {
    const server = app().getHttpServer();
    for (let i = 1; i <= 5; i += 1) {
      await request(server).post('/api/auth/login').send({ username: 'hujumchi', password: `p${i}` }).expect(401);
    }

    const blocked = await request(server)
      .post('/api/auth/login')
      .send({ username: admin.username, password: admin.password })
      .expect(429);
    expect(blocked.body).toEqual({ code: 'TOO_MANY_ATTEMPTS', message: expect.any(String) });

    // Cheklov faqat login uchun: token bilan boshqa so'rovlar ishlayveradi.
    for (let i = 0; i < 7; i += 1) {
      await request(server).get('/api/auth/me').set('Authorization', `Bearer ${await tokenFor(app(), admin.id)}`).expect(200);
    }
  });
});

// ---------------------------------------------------------------------------

describe('Rollar: 401 / 403', () => {
  const app = useApp();
  let calculatorToken: string;
  let approverToken: string;

  beforeAll(async () => {
    calculatorToken = await tokenFor(app(), (await createUser(prisma, { roles: ['CALCULATOR'] })).id);
    approverToken = await tokenFor(app(), (await createUser(prisma, { roles: ['APPROVER'] })).id);
  });

  it('tokensiz → 401 UNAUTHORIZED', async () => {
    const res = await request(app().getHttpServer()).get('/api/users').expect(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('noto\'g\'ri token → 401', async () => {
    await request(app().getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer abc.def.ghi').expect(401);
  });

  it('CALCULATOR va APPROVER → /users, /roles da 403 FORBIDDEN', async () => {
    for (const token of [calculatorToken, approverToken]) {
      for (const path of ['/api/users', '/api/roles']) {
        const res = await request(app().getHttpServer()).get(path).set('Authorization', `Bearer ${token}`).expect(403);
        expect(res.body.code).toBe('FORBIDDEN');
      }
    }
  });

  it('audit: ADMIN va APPROVER ko\'radi, CALCULATOR — 403', async () => {
    const server = app().getHttpServer();
    await request(server).get('/api/audit-logs').set('Authorization', `Bearer ${await tokenFor(app(), admin.id)}`).expect(200);
    await request(server).get('/api/audit-logs').set('Authorization', `Bearer ${approverToken}`).expect(200);
    await request(server).get('/api/audit-logs').set('Authorization', `Bearer ${calculatorToken}`).expect(403);
  });

  it('ADMIN /roles → 3 ta rol', async () => {
    const res = await request(app().getHttpServer())
      .get('/api/roles')
      .set('Authorization', `Bearer ${await tokenFor(app(), admin.id)}`)
      .expect(200);
    expect(res.body.map((r: { name: string }) => r.name).sort()).toEqual(['ADMIN', 'APPROVER', 'CALCULATOR']);
  });
});

// ---------------------------------------------------------------------------

describe('Foydalanuvchilarni boshqarish (ADMIN)', () => {
  const app = useApp();
  let adminToken: string;

  beforeAll(async () => {
    adminToken = await tokenFor(app(), admin.id);
  });

  const post = (body: object) =>
    request(app().getHttpServer()).post('/api/users').set('Authorization', `Bearer ${adminToken}`).send(body);
  const patch = (id: bigint | string, body: object, token = adminToken) =>
    request(app().getHttpServer()).patch(`/api/users/${id}`).set('Authorization', `Bearer ${token}`).send(body);

  it('yaratish → 201; javobda parol yo\'q; USER_CREATE audit (parolsiz); yangi foydalanuvchi login qila oladi', async () => {
    const username = uniqueName('yangi');
    const res = await post({ username, password: 'boshlangich-1', roles: ['CALCULATOR', 'APPROVER'] }).expect(201);

    expect(res.body).toMatchObject({ username, isActive: true, employeeCode: null, roles: ['APPROVER', 'CALCULATOR'] });
    expect(JSON.stringify(res.body)).not.toMatch(/password|argon2/i);

    const [row] = await auditRows('USER_CREATE', BigInt(res.body.id));
    expect(row.userId).toBe(admin.id);
    expect(row.entityType).toBe('users');
    expect(row.oldData).toBeNull();
    expect(row.newData).toEqual({ username, isActive: true, employeeCode: null, roles: ['APPROVER', 'CALCULATOR'] });
    expect(jsonOf(row)).not.toMatch(/boshlangich|argon2/);

    await request(app().getHttpServer()).post('/api/auth/login').send({ username, password: 'boshlangich-1' }).expect(200);
  });

  it('band username → 409 USERNAME_TAKEN', async () => {
    const res = await post({ username: admin.username, password: 'a'.repeat(8), roles: ['CALCULATOR'] }).expect(409);
    expect(res.body.code).toBe('USERNAME_TAKEN');
  });

  it('noto\'g\'ri ma\'lumot → 400 VALIDATION_ERROR (details bilan)', async () => {
    const res = await post({ username: uniqueName('v'), password: 'qisqa', roles: ['BOSS'] }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details.map((d: { path: string }) => d.path).sort()).toEqual(['password', 'roles.0']);
  });

  it('xodimga bog\'lash — faqat employeeCode (biznes kodi) orqali', async () => {
    const code = uniqueName('EMP');
    await prisma.employee.create({ data: { employeeCode: code } });

    const res = await post({ username: uniqueName('xodim'), password: 'a'.repeat(8), roles: ['CALCULATOR'], employeeCode: code }).expect(201);
    expect(res.body.employeeCode).toBe(code);

    const twice = await post({ username: uniqueName('xodim'), password: 'a'.repeat(8), roles: ['CALCULATOR'], employeeCode: code }).expect(409);
    expect(twice.body.code).toBe('EMPLOYEE_ALREADY_LINKED');

    const missing = await post({ username: uniqueName('xodim'), password: 'a'.repeat(8), roles: ['CALCULATOR'], employeeCode: 'YOQ-000' }).expect(404);
    expect(missing.body.code).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('ro\'yxat va bitta foydalanuvchi; yo\'q id → 404, noto\'g\'ri id → 400', async () => {
    const server = app().getHttpServer();
    const list = await request(server).get('/api/users').set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(list.body.some((u: { username: string }) => u.username === admin.username)).toBe(true);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|argon2/);

    await request(server).get(`/api/users/${admin.id}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    const missing = await request(server).get('/api/users/999999999').set('Authorization', `Bearer ${adminToken}`).expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
    const bad = await request(server).get('/api/users/abc').set('Authorization', `Bearer ${adminToken}`).expect(400);
    expect(bad.body.code).toBe('VALIDATION_ERROR');
  });

  it('rol olib tashlansa — eski token bilan keyingi so\'rov darhol 403', async () => {
    const approver = await createUser(prisma, { roles: ['APPROVER'] });
    const token = await tokenFor(app(), approver.id);
    const server = app().getHttpServer();

    await request(server).get('/api/audit-logs').set('Authorization', `Bearer ${token}`).expect(200);
    await patch(approver.id, { roles: ['CALCULATOR'] }).expect(200);
    await request(server).get('/api/audit-logs').set('Authorization', `Bearer ${token}`).expect(403);

    const [row] = await auditRows('USER_UPDATE', approver.id);
    expect(row.oldData).toMatchObject({ roles: ['APPROVER'] });
    expect(row.newData).toMatchObject({ roles: ['CALCULATOR'] });
  });

  it('bloklansa — eski token bilan 401 USER_INACTIVE', async () => {
    const user = await createUser(prisma, { roles: ['CALCULATOR'] });
    const token = await tokenFor(app(), user.id);

    await patch(user.id, { isActive: false }).expect(200);
    const res = await request(app().getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    expect(res.body.code).toBe('USER_INACTIVE');
  });

  it('LAST_ADMIN: oxirgi faol admin o\'zini bloklay olmaydi va ADMIN rolini ololmaydi', async () => {
    const activeAdmins = await prisma.user.count({ where: { isActive: true, roles: { some: { role: { name: 'ADMIN' } } } } });
    expect(activeAdmins).toBe(1); // shart: bazada faqat `admin`

    expect((await patch(admin.id, { isActive: false }).expect(409)).body.code).toBe('LAST_ADMIN');
    expect((await patch(admin.id, { roles: ['APPROVER'] }).expect(409)).body.code).toBe('LAST_ADMIN');

    // Ikkinchi admin bo'lsa — birini ADMIN'likdan olish mumkin.
    const second = await createUser(prisma, { roles: ['ADMIN'] });
    await patch(second.id, { roles: ['APPROVER'] }).expect(200);
    // ...lekin oxirgisini baribir yo'q.
    expect((await patch(admin.id, { roles: ['CALCULATOR'] }).expect(409)).body.code).toBe('LAST_ADMIN');

    // Rad etilgan o'zgarishlar bazaga ham, auditga ham tushmagan.
    const fresh = await prisma.user.findUniqueOrThrow({ where: { id: admin.id }, include: { roles: { include: { role: true } } } });
    expect(fresh.isActive).toBe(true);
    expect(fresh.roles.map((r) => r.role.name)).toEqual(['ADMIN']);
    expect(await auditRows('USER_UPDATE', admin.id)).toHaveLength(0);
  });

  it('bo\'sh PATCH → 400', async () => {
    expect((await patch(admin.id, {}).expect(400)).body.code).toBe('VALIDATION_ERROR');
  });

  it('parolni tiklash (reset) → yangi parol ishlaydi, eskisi yo\'q; USER_PASSWORD_RESET audit; eski token → 401', async () => {
    const user = await createUser(prisma, { roles: ['CALCULATOR'] });
    const userToken = await tokenFor(app(), user.id);
    const server = app().getHttpServer();
    await request(server).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`).expect(200);

    await request(server)
      .post(`/api/users/${user.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ newPassword: 'tiklangan-parol' })
      .expect(204);

    const rows = await auditRows('USER_PASSWORD_RESET', user.id);
    expect(rows).toHaveLength(1);
    expect(jsonOf(rows)).not.toMatch(/tiklangan|argon2/);

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const { verify } = await import('argon2');
    expect(await verify(stored.passwordHash, 'tiklangan-parol')).toBe(true);
    expect(await verify(stored.passwordHash, user.password)).toBe(false);

    // Tiklangandan keyin foydalanuvchining eski tokeni — 401; admin tokeniga ta'sir yo'q.
    const stale = await request(server).get('/api/auth/me').set('Authorization', `Bearer ${userToken}`).expect(401);
    expect(stale.body.code).toBe('UNAUTHORIZED');
    await request(server).get('/api/auth/me').set('Authorization', `Bearer ${adminToken}`).expect(200);
  });

  it('TRANZAKSIYA: audit yozilmasa — foydalanuvchi ham yaratilmaydi', async () => {
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const auditSpy = jest.spyOn(app().get(AuditService), 'log').mockRejectedValueOnce(new Error('audit ishlamadi'));
    const username = uniqueName('rollback');

    const res = await post({ username, password: 'a'.repeat(8), roles: ['CALCULATOR'] }).expect(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(await prisma.user.count({ where: { username } })).toBe(0);

    auditSpy.mockRestore();
    logSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------

describe('POST /api/auth/change-password', () => {
  const app = useApp();

  it('joriy parol noto\'g\'ri → 400; to\'g\'ri → 204, eski parol va eski token endi ishlamaydi; PASSWORD_CHANGE audit', async () => {
    const user = await createUser(prisma, { roles: ['CALCULATOR'] });
    const token = await tokenFor(app(), user.id);
    const server = app().getHttpServer();

    const wrong = await request(server)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'notogri', newPassword: 'yangi-parol-1' })
      .expect(400);
    expect(wrong.body.code).toBe('INVALID_CURRENT_PASSWORD');

    await request(server)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: user.password, newPassword: 'yangi-parol-1' })
      .expect(204);

    // Parol almashgach eski token darhol ishlamaydi; yangi login bilan olingan token ishlaydi.
    const stale = await request(server).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
    expect(stale.body.code).toBe('UNAUTHORIZED');

    await request(server).post('/api/auth/login').send({ username: user.username, password: user.password }).expect(401);
    const relogin = await request(server)
      .post('/api/auth/login')
      .send({ username: user.username, password: 'yangi-parol-1' })
      .expect(200);
    await request(server).get('/api/auth/me').set('Authorization', `Bearer ${relogin.body.accessToken}`).expect(200);

    const rows = await auditRows('PASSWORD_CHANGE', user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(user.id);
    expect(jsonOf(rows)).not.toMatch(/yangi-parol|argon2/);
  });

  it('tokensiz → 401', async () => {
    await request(app().getHttpServer())
      .post('/api/auth/change-password')
      .send({ currentPassword: 'a', newPassword: 'b'.repeat(8) })
      .expect(401);
  });
});

// ---------------------------------------------------------------------------

describe('GET /api/audit-logs', () => {
  const app = useApp();

  it('entityType/entityId filtri, sahifalash, username bilan; BigInt → satr', async () => {
    const user = await createUser(prisma, { roles: ['CALCULATOR'] });
    const adminToken = await tokenFor(app(), admin.id);
    const server = app().getHttpServer();
    await request(server).patch(`/api/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`).send({ roles: ['APPROVER'] }).expect(200);
    await request(server).patch(`/api/users/${user.id}`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false }).expect(200);

    const res = await request(server)
      .get(`/api/audit-logs?entityType=users&entityId=${user.id}&pageSize=1`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(res.body.items).toHaveLength(1);
    // Eng yangisi birinchi.
    expect(res.body.items[0]).toMatchObject({
      userId: admin.id.toString(),
      username: admin.username,
      action: 'USER_UPDATE',
      entityType: 'users',
      entityId: user.id.toString(),
      newData: { isActive: false },
    });

    const page2 = await request(server)
      .get(`/api/audit-logs?entityType=users&entityId=${user.id}&pageSize=1&page=2`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(page2.body.items[0].newData).toMatchObject({ roles: ['APPROVER'] });
  });

  it('noto\'g\'ri filtr → 400 VALIDATION_ERROR', async () => {
    const res = await request(app().getHttpServer())
      .get('/api/audit-logs?entityId=abc')
      .set('Authorization', `Bearer ${await tokenFor(app(), admin.id)}`)
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});
