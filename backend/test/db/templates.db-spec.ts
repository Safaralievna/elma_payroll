/**
 * Shablonlar (GET /imports/templates/:type) E2E: shablonda namuna qator yo'q, misollar «Yo'riqnoma»
 * varag'ida. Shu misollardan bitta qator yig'ilib import qilinganda o'tishi kerak. Misol sanalari 2026-yilda:
 * boshqa testlar yopgan davrlarga (2025-dekabrgacha) to'g'ri kelmaydi. Misollar seed'dagi haqiqiy kodlarga (lavozim SALES_REP) tayanadi; seed'da yo'q
 * bo'lim / guruh / kategoriya / rahbar test ichida yaratiladi (shablon izohida "avval yaratiladi" deyilgan).
 */
import { INestApplication } from '@nestjs/common';
import { execSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { buildWorkbook } from '../../src/imports/excel/workbook';
import { PrismaService } from '../../src/prisma/prisma.service';
import { GUIDE_SHEET_NAME } from '../../src/imports/import-templates';
import { createTestApp, createUser, ensureRoles, tokenFor, useTestEnv } from './app-helpers';
import { e2eDatabaseUrl } from './db-helpers';

let app: INestApplication;
let prisma: PrismaService;
let calc: string;

beforeAll(async () => {
  useTestEnv();
  // Haqiqiy seed (npm run db:seed) E2E bazasiga: lavozimlar, rollar, KPI.
  // Child process jest'dagi process.env nusxasini ko'rmaydi — E2E bazasi manzilini aniq beramiz.
  execSync('npx tsx prisma/seed.ts', { env: { ...process.env, DATABASE_URL: e2eDatabaseUrl() }, stdio: 'pipe' });

  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);

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

/** Ishdan ketgan sana misoli xodimni nofaol qiladi (team-links uni rad etadi) — ketmagan xodim sifatida bo'sh qoldiriladi. */
const LEAVE_BLANK = new Set(['ishdan_ketgan_sana']);

/** Shablon: 1-varaq faqat sarlavha; «Yo'riqnoma» dagi «misol» ustunidan bitta ma'lumot qatori yig'iladi. */
async function fileFromExamples(template: Buffer): Promise<{ header: string[]; file: Buffer }> {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(template as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets[0]!;
  expect(sheet.actualRowCount).toBe(1); // ro'yxatli bo'sh katakchalar rowCount'ni oshiradi, ma'lumot qatori emas
  const header = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(String);
  const guide = book.getWorksheet(GUIDE_SHEET_NAME)!;
  const examples = new Map<string, string>();
  guide.eachRow((row, number) => {
    if (number > 1 && row.getCell(2).value) examples.set(String(row.getCell(1).value), String(row.getCell(4).value));
  });
  return { header, file: await buildWorkbook(header, [header.map((name) => (LEAVE_BLANK.has(name) ? null : (examples.get(name) ?? null)))]) };
}

// Tartib muhim: team-links misolidagi xodim E001 avval employees importi bilan yaratiladi.
describe.each(['products', 'clients', 'employees', 'team-links'])('%s shabloni', (type) => {
  it("namunasiz shablon; «misol» ustunidagi qiymatlar import'dan o'tadi", async () => {
    const { file } = await fileFromExamples(await downloadTemplate(type));
    const response = await upload(type, file);
    if (response.status !== 201) throw new Error(JSON.stringify(response.body));
    expect(response.body).toMatchObject({ status: 'ACTIVE', rowCount: 1, invalidRowCount: 0, created: 1 });
  });

  it("shablonning o'zi (faqat sarlavha) import'dan o'tmaydi: soxta ma'lumot yozilmaydi", async () => {
    const response = await upload(type, await downloadTemplate(type));
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_FILE');
  });
});

it("employees misoli: lavozim SALES_REP va oylik oyning 1-kuni (2026-02-01) bilan yozildi", async () => {
  const employee = await prisma.employee.findUniqueOrThrow({
    where: { employeeCode: 'E001' },
    include: { assignments: { include: { position: true } }, salaryHistory: true },
  });
  expect(employee.assignments.map((a) => [a.position.code, a.startDate.toISOString().slice(0, 10)])).toEqual([['SALES_REP', '2026-02-01']]);
  expect(employee.salaryHistory.map((s) => s.startDate.toISOString().slice(0, 10))).toEqual(['2026-02-01']);
});
