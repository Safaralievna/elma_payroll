/**
 * 4-bosqich E2E: ma'lumotnomalar (bo'limlar, lavozimlar, mahsulot guruhlari,
 * mahsulotlar, mijoz kategoriyalari, mijozlar, narx turlari).
 * Yozish — CALCULATOR, o'qish — hamma rol. O'chirish yo'q (isActive=false).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, createUser, ensureRoles, tokenFor, uniqueName, useTestEnv } from './app-helpers';

let app: INestApplication;
let prisma: PrismaService;
let calc: string;
let approver: string;
let admin: string;
let adminId: bigint;

beforeAll(async () => {
  useTestEnv();
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);
  calc = await tokenFor(app, (await createUser(prisma, { roles: ['CALCULATOR'] })).id);
  approver = await tokenFor(app, (await createUser(prisma, { roles: ['APPROVER'] })).id);
  adminId = (await createUser(prisma, { roles: ['ADMIN'] })).id;
  admin = await tokenFor(app, adminId);
});

afterAll(async () => {
  // auth.db-spec LAST_ADMIN testi bazada yagona faol admin bo'lishini talab qiladi —
  // fayllar tartibidan qat'i nazar, bu yerdagi admin oxirida bloklanadi.
  await prisma.user.update({ where: { id: adminId }, data: { isActive: false } });
  await app.close();
});

function http(token: string) {
  const server = app.getHttpServer();
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(server).get(`/api${url}`).set(auth),
    post: (url: string, body: object) => request(server).post(`/api${url}`).set(auth).send(body),
    patch: (url: string, body: object) => request(server).patch(`/api${url}`).set(auth).send(body),
    delete: (url: string) => request(server).delete(`/api${url}`).set(auth),
  };
}

describe('Bo\'limlar (departments) — umumiy CRUD xatti-harakati', () => {
  it('CALCULATOR yaratadi → 201, audit REFERENCE_CREATE', async () => {
    const code = uniqueName('DEP');
    const res = await http(calc).post('/departments', { name: 'Savdo bo\'limi', code }).expect(201);
    expect(res.body).toEqual({
      id: expect.any(String),
      code,
      name: "Savdo bo'limi",
      isActive: true,
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'REFERENCE_CREATE', entityType: 'departments', entityId: BigInt(res.body.id) },
    });
    expect(audit?.newData).toMatchObject({ code, name: "Savdo bo'limi", isActive: true });
  });

  it('APPROVER va ADMIN o\'qiydi, lekin yoza olmaydi (403)', async () => {
    await http(approver).get('/departments').expect(200);
    await http(admin).get('/departments').expect(200);
    await http(approver).post('/departments', { name: 'X', code: uniqueName('D') }).expect(403);
    await http(admin).post('/departments', { name: 'X', code: uniqueName('D') }).expect(403);
  });

  it('band kod → 409 CODE_TAKEN; kod majburiy → 400', async () => {
    const code = uniqueName('DEP');
    await http(calc).post('/departments', { name: 'A', code }).expect(201);
    const res = await http(calc).post('/departments', { name: 'B', code }).expect(409);
    expect(res.body.code).toBe('CODE_TAKEN');
    expect((await http(calc).post('/departments', { name: 'C' }).expect(400)).body.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH: nofaol qilish, audit eski/yangi qiymat bilan; o\'chirish endpointi yo\'q', async () => {
    const created = await http(calc).post('/departments', { name: 'Eski', code: uniqueName('DEP') }).expect(201);
    const res = await http(calc).patch(`/departments/${created.body.id}`, { isActive: false, name: 'Yopilgan' }).expect(200);
    expect(res.body).toMatchObject({ isActive: false, name: 'Yopilgan' });

    const audit = await prisma.auditLog.findFirst({
      where: { action: 'REFERENCE_UPDATE', entityType: 'departments', entityId: BigInt(created.body.id) },
    });
    expect(audit?.oldData).toMatchObject({ isActive: true, name: 'Eski' });
    expect(audit?.newData).toMatchObject({ isActive: false, name: 'Yopilgan' });

    await http(calc).delete(`/departments/${created.body.id}`).expect(404);
  });

  it('GET: 404, filtrlar (search, isActive) va sahifalash', async () => {
    expect((await http(calc).get('/departments/999999999').expect(404)).body.code).toBe('NOT_FOUND');
    const marker = uniqueName('QIDIR');
    await http(calc).post('/departments', { name: `${marker} faol`, code: `${marker}_1` }).expect(201);
    const inactive = await http(calc).post('/departments', { name: `${marker} nofaol`, code: `${marker}_2` }).expect(201);
    await http(calc).patch(`/departments/${inactive.body.id}`, { isActive: false }).expect(200);

    const all = await http(approver).get(`/departments?search=${marker}`).expect(200);
    expect(all.body).toMatchObject({ total: 2, page: 1 });
    const active = await http(approver).get(`/departments?search=${marker.toLowerCase()}&isActive=true`).expect(200);
    expect(active.body.items.map((item: { code: string }) => item.code)).toEqual([`${marker}_1`]);
    const paged = await http(approver).get(`/departments?search=${marker}&pageSize=1&page=2`).expect(200);
    expect(paged.body.items).toHaveLength(1);

    await http(approver).get('/departments?nomalum=1').expect(400);
  });
});

describe('Lavozimlar — depositPercent', () => {
  it('0–100 oralig\'ida, ko\'pi bilan 2 kasr; null — depozit yo\'q', async () => {
    const res = await http(calc).post('/positions', { name: 'Ekspeditor', code: uniqueName('POS'), depositPercent: '10.5' }).expect(201);
    expect(res.body.depositPercent).toBe('10.50');
    await http(calc).post('/positions', { name: 'X', code: uniqueName('POS'), depositPercent: '101' }).expect(400);
    await http(calc).post('/positions', { name: 'X', code: uniqueName('POS'), depositPercent: '1.234' }).expect(400);
    const cleared = await http(calc).patch(`/positions/${res.body.id}`, { depositPercent: null }).expect(200);
    expect(cleared.body.depositPercent).toBeNull();
  });
});

describe('Mahsulotlar va mijozlar — bog\'langan ma\'lumotnoma', () => {
  it('mahsulot: guruh topilmasa 404 REFERENCE_NOT_FOUND, nofaol bo\'lsa 409 REFERENCE_INACTIVE', async () => {
    const group = await http(calc).post('/product-groups', { name: 'Ichimliklar', code: uniqueName('PG') }).expect(201);
    const oldGroup = await http(calc).post('/product-groups', { name: 'Eski', code: uniqueName('PG') }).expect(201);
    await http(calc).patch(`/product-groups/${oldGroup.body.id}`, { isActive: false }).expect(200);

    const code = uniqueName('PRD');
    const missing = await http(calc).post('/products', { name: 'Choy', code, productGroupId: '999999999' }).expect(404);
    expect(missing.body.code).toBe('REFERENCE_NOT_FOUND');
    const inactive = await http(calc).post('/products', { name: 'Choy', code, productGroupId: oldGroup.body.id }).expect(409);
    expect(inactive.body.code).toBe('REFERENCE_INACTIVE');

    const created = await http(calc).post('/products', { name: 'Choy', code, productGroupId: group.body.id }).expect(201);
    expect(created.body).toMatchObject({ code, productGroupId: group.body.id, productGroupCode: group.body.code });

    const filtered = await http(approver).get(`/products?productGroupId=${group.body.id}`).expect(200);
    expect(filtered.body.items.map((item: { code: string }) => item.code)).toEqual([code]);
  });

  it('mijoz: kategoriya ixtiyoriy', async () => {
    const category = await http(calc).post('/client-categories', { name: 'VIP', code: uniqueName('CC') }).expect(201);
    const plain = await http(calc).post('/clients', { name: "Do'kon", code: uniqueName('CL') }).expect(201);
    expect(plain.body.clientCategoryId).toBeNull();
    const withCategory = await http(calc)
      .patch(`/clients/${plain.body.id}`, { clientCategoryId: category.body.id })
      .expect(200);
    expect(withCategory.body).toMatchObject({ clientCategoryId: category.body.id, clientCategoryCode: category.body.code });
  });

  it('narx turlari', async () => {
    const res = await http(calc).post('/price-types', { name: 'Maxsus', code: uniqueName('PT') }).expect(201);
    expect(res.body).toEqual({ id: expect.any(String), code: expect.any(String), name: 'Maxsus', isActive: true });
  });
});
