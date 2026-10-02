/**
 * Shablonlar (GET /imports/templates/:type) E2E: yuklab olingan fayl o'zgartirilmasdan import'dan o'tishi kerak.
 * Namuna qatorlari seed'dagi haqiqiy kodlarga (lavozim SALES_REP) tayanadi; seed'da yo'q
 * bo'lim / guruh / kategoriya / rahbar test ichida yaratiladi (shablon izohida "avval yaratiladi" deyilgan).
 */
import { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, createUser, ensureRoles, tokenFor, useTestEnv } from './app-helpers';
import { e2eDatabaseUrl } from './db-helpers';

let app: INestApplication;
let prisma: PrismaService;
let calc: string;
let reopenedPeriodIds: bigint[] = [];

beforeAll(async () => {
  useTestEnv();
  // Haqiqiy seed (npm run db:seed) E2E bazasiga: lavozimlar, rollar, KPI.
  // Child process jest'dagi process.env nusxasini ko'rmaydi — E2E bazasi manzilini aniq beramiz.
  execSync('npx tsx prisma/seed.ts', { env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() }, stdio: 'pipe' });

  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);

  // E2E bazasi fayllar orasida umumiy: boshqa testlar yopgan davrlar namuna sanalarini (2025-yil)
  // PERIOD_CLOSED qilib qo'yardi. Shablon namunasini yopilgan davrdan mustaqil tekshirish uchun
  // ularni vaqtincha OPEN qilamiz, afterAll'da qaytaramiz.
  reopenedPeriodIds = (await prisma.payrollPeriod.findMany({ where: { status: 'CLOSED' }, select: { id: true } })).map((p) => p.id);
  await prisma.payrollPeriod.updateMany({ where: { id: { in: reopenedPeriodIds } }, data: { status: 'OPEN' } });
  calc = await tokenFor(app, (await createUser(prisma, { roles: ['CALCULATOR'] })).id);

  await prisma.department.upsert({ where: { code: 'SAVDO' }, create: { name: 'Savdo', code: 'SAVDO' }, update: {} });
  await prisma.productGroup.upsert({ where: { code: 'G001' }, create: { name: 'Namuna guruh', code: 'G001' }, update: {} });
  await prisma.clientCategory.upsert({ where: { code: 'K001' }, create: { name: 'Namuna kategoriya', code: 'K001' }, update: {} });
  // Team-links namunasidagi rahbar (E010) — oldindan mavjud xodim.
  await prisma.employee.upsert({ where: { employeeCode: 'E010' }, create: { employeeCode: 'E010' }, update: {} });
});

afterAll(async () => {
  // Seed yaratgan `admin` ADMIN roli bilan: auth testlari "bitta faol admin" deb hisoblaydi — olib tashlaymiz.
  await prisma.userRole.deleteMany({ where: { user: { username: 'admin' } } });
  await prisma.user.deleteMany({ where: { username: 'admin' } });
  await prisma.payrollPeriod.updateMany({ where: { id: { in: reopenedPeriodIds } }, data: { status: 'CLOSED' } });
  await app.close();
});

async function downloadTemplate(type: string): Promise<Buffer> {
  const response = await request(app.getHttpServer())
    .get(`/api/imports/templates/${type}`)
    .set('Authorization', `Bearer ${calc}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200);
  return response.body as Buffer;
}

function upload(type: string, buffer: Buffer) {
  return request(app.getHttpServer())
    .post(`/api/imports/${type}`)
    .set('Authorization', `Bearer ${calc}`)
    .attach('file', buffer, `${type}-shablon.xlsx`);
}

// Tartib muhim: team-links namunasidagi xodim E001 avval employees importi bilan yaratiladi.
describe.each(['products', 'clients', 'employees', 'team-links'])('%s shabloni', (type) => {
  it("yuklab olingan shablon (namuna qator bilan) o'zgartirilmasdan import'dan o'tadi", async () => {
    const template = await downloadTemplate(type);
    const response = await upload(type, template);
    if (response.status !== 201) throw new Error(JSON.stringify(response.body));
    expect(response.body).toMatchObject({ status: 'ACTIVE', rowCount: 1, invalidRowCount: 0, created: 1 });
  });
});

it("employees namunasi: lavozim SALES_REP va oylik oyning 1-kuni (2025-02-01) bilan yozildi", async () => {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { employeeCode: 'E001' },
    include: { assignments: { include: { position: true } }, salaryHistory: true },
  });
  expect(employee.assignments.map((a) => [a.position.code, a.startDate.toISOString().slice(0, 10)])).toEqual([['SALES_REP', '2025-02-01']]);
  expect(employee.salaryHistory.map((s) => s.startDate.toISOString().slice(0, 10))).toEqual(['2025-02-01']);
});
