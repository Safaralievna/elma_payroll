/**
 * 4-bosqich E2E: Excel import (EMPLOYEES, TEAM_LINKS, PRODUCTS, CLIENTS).
 *
 * Ma'lumotnoma importlari davrga bog'lanmaydi (period_id = NULL), shuning uchun bir
 * turdagi hamma batch'lar bitta versiyalar qatorida: testlar versiya raqamlarini
 * nisbiy tekshiradi. .xlsx fayllar test ichida exceljs bilan yasaladi.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { buildWorkbook, readFirstSheet } from '../../src/imports/excel/workbook';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, createUser, ensureRoles, tokenFor, uniqueName, useTestEnv } from './app-helpers';

let app: INestApplication;
let prisma: PrismaService;
let calc: string;
let approver: string;
let deptCode: string;
let posCode: string;
let pos2Code: string;

const EMPLOYEE_HEADER = [
  'xodim_kodi',
  'familiya',
  'ism',
  'bolim_kodi',
  'lavozim_kodi',
  'lavozim_sanasi',
  'oylik',
  'oylik_sanasi',
  'ishdan_ketgan_sana',
];

beforeAll(async () => {
  useTestEnv();
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);
  calc = await tokenFor(app, (await createUser(prisma, { roles: ['CALCULATOR'] })).id);
  approver = await tokenFor(app, (await createUser(prisma, { roles: ['APPROVER'] })).id);

  deptCode = uniqueName('DEP');
  posCode = uniqueName('POS');
  pos2Code = uniqueName('POS');
  await prisma.department.create({ data: { name: deptCode, code: deptCode } });
  await prisma.position.create({ data: { name: posCode, code: posCode } });
  await prisma.position.create({ data: { name: pos2Code, code: pos2Code } });
});

afterAll(async () => {
  await app.close();
});

function upload(type: string, buffer: Buffer, token = calc, fileName = 'import.xlsx') {
  return request(app.getHttpServer())
    .post(`/api/imports/${type}`)
    .set('Authorization', `Bearer ${token}`)
    .attach('file', buffer, fileName);
}

function get(url: string, token = approver) {
  return request(app.getHttpServer()).get(`/api${url}`).set('Authorization', `Bearer ${token}`);
}

async function employeeHistory(code: string) {
  return prisma.employee.findUniqueOrThrow({
    where: { employeeCode: code },
    include: {
      assignments: { orderBy: { startDate: 'asc' }, include: { position: true } },
      salaryHistory: { orderBy: { startDate: 'asc' } },
    },
  });
}

const iso = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

// ---------------------------------------------------------------------------

describe('EMPLOYEES importi', () => {
  const e1 = uniqueName('IMP');
  const e2 = uniqueName('IMP');
  let firstBatchId: string;
  let firstFile: Buffer;

  it('to\'g\'ri fayl → 201, batch ACTIVE; xodimlar, lavozim va oylik yaratiladi; audit', async () => {
    const file = await buildWorkbook(EMPLOYEE_HEADER, [
      [e1, 'Karimov', 'Bobur', deptCode, posCode, '2026-01-01', 3000000, '2026-01-01', null],
      [e2, 'Aliyeva', 'Dilnoza', deptCode, posCode, new Date(Date.UTC(2026, 0, 1)), '2 500 000', '01.01.2026', null],
    ]);
    firstFile = file;
    const res = await upload('employees', file).expect(201);
    expect(res.body).toMatchObject({
      importType: 'EMPLOYEES',
      status: 'ACTIVE',
      fileName: 'import.xlsx',
      rowCount: 2,
      created: 2,
      updated: 0,
      unchanged: 0,
    });
    firstBatchId = res.body.id;

    const employee = await employeeHistory(e2);
    expect(employee).toMatchObject({ lastName: 'Aliyeva', firstName: 'Dilnoza', isActive: true });
    expect(employee.assignments.map((item) => [iso(item.startDate), iso(item.endDate), item.position.code])).toEqual([
      ['2026-01-01', null, posCode],
    ]);
    expect(employee.salaryHistory[0].salaryAmount.toFixed(2)).toBe('2500000.00');

    const rows = await prisma.importRow.findMany({ where: { batchId: BigInt(firstBatchId) }, orderBy: { rowNumber: 'asc' } });
    expect(rows.map((row) => [row.rowNumber, row.employeeId, row.isValid])).toEqual([
      [2, e1, true],
      [3, e2, true],
    ]);
    expect(rows[1].rawData).toMatchObject({ xodim_kodi: e2, lavozim_sanasi: '2026-01-01', oylik: '2 500 000' });

    const applyAudit = await prisma.auditLog.findFirst({ where: { action: 'IMPORT_APPLY', entityId: BigInt(firstBatchId) } });
    expect(applyAudit?.newData).toMatchObject({ importType: 'EMPLOYEES', created: 2 });
    expect(await prisma.auditLog.count({ where: { action: 'EMPLOYEE_CREATE', entityId: employee.id } })).toBe(1);
  });

  it('xuddi shu fayl qayta → 409 FILE_ALREADY_IMPORTED (batch raqami bilan)', async () => {
    const res = await upload('employees', firstFile).expect(409);
    expect(res.body.code).toBe('FILE_ALREADY_IMPORTED');
    expect(res.body.message).toContain(`#${firstBatchId}`);
  });

  it('o\'zgargan fayl → yangi versiya ACTIVE, eskisi ARCHIVED; lavozim almashadi, o\'zgarmagani tegilmaydi', async () => {
    const before = await prisma.importBatch.findUniqueOrThrow({ where: { id: BigInt(firstBatchId) } });
    const file = await buildWorkbook(EMPLOYEE_HEADER, [
      [e1, null, null, deptCode, pos2Code, '2026-04-01', 3000000, '2026-01-01', null],
      [e2, 'Aliyeva', 'Dilnoza', deptCode, posCode, '2026-01-01', 2500000, '2026-01-01', null],
    ]);
    const res = await upload('employees', file).expect(201);
    expect(res.body).toMatchObject({ status: 'ACTIVE', versionNumber: before.versionNumber + 1, updated: 1, unchanged: 1 });

    const old = await prisma.importBatch.findUniqueOrThrow({ where: { id: BigInt(firstBatchId) } });
    expect(old.status).toBe('ARCHIVED');
    expect(await prisma.importBatch.count({ where: { importType: 'EMPLOYEES', status: 'ACTIVE' } })).toBe(1);

    const employee = await employeeHistory(e1);
    expect(employee.lastName).toBe('Karimov'); // bo'sh katakcha qiymatni o'chirmaydi
    expect(employee.assignments.map((item) => [iso(item.startDate), iso(item.endDate), item.position.code])).toEqual([
      ['2026-01-01', '2026-03-31', posCode],
      ['2026-04-01', null, pos2Code],
    ]);
    expect(employee.salaryHistory).toHaveLength(1);
  });

  it('bitta qator xato → 422 IMPORT_HAS_ERRORS, batch INVALID, bazada hech narsa o\'zgarmaydi', async () => {
    const fresh = uniqueName('IMP');
    const activeBefore = await prisma.importBatch.findFirstOrThrow({ where: { importType: 'EMPLOYEES', status: 'ACTIVE' } });
    const file = await buildWorkbook(EMPLOYEE_HEADER, [
      [fresh, 'Yangi', 'Xodim', deptCode, posCode, '2026-05-01', 1000000, '2026-05-01', null],
      [e1, null, null, null, null, null, 4000000, '2026-05-15', null],
      [uniqueName('IMP'), null, null, 'YOQ_BOLIM', posCode, '2026-05-01', null, null, null],
    ]);
    const res = await upload('employees', file).expect(422);
    expect(res.body).toMatchObject({
      code: 'IMPORT_HAS_ERRORS',
      details: { batchId: expect.any(String), errorCount: 2 },
    });
    expect(res.body.details.errors).toEqual([
      { rowNumber: 3, employeeCode: e1, field: 'oylik_sanasi', message: expect.stringContaining('1-kuni') },
      { rowNumber: 4, employeeCode: expect.any(String), field: 'bolim_kodi', message: expect.stringContaining('YOQ_BOLIM') },
    ]);

    const batch = await prisma.importBatch.findUniqueOrThrow({ where: { id: BigInt(res.body.details.batchId) } });
    expect(batch.status).toBe('INVALID');
    expect(await prisma.employee.findUnique({ where: { employeeCode: fresh } })).toBeNull();
    expect((await employeeHistory(e1)).salaryHistory).toHaveLength(1);
    expect((await prisma.importBatch.findUniqueOrThrow({ where: { id: activeBefore.id } })).status).toBe('ACTIVE');

    const errors = await get(`/imports/${batch.id}/errors`).expect(200);
    expect(errors.body).toMatchObject({ total: 2, items: [{ rowNumber: 3, field: 'oylik_sanasi' }, { rowNumber: 4 }] });
    const detail = await get(`/imports/${batch.id}`).expect(200);
    expect(detail.body).toMatchObject({ status: 'INVALID', rowCount: 3, invalidRowCount: 2 });

    // Xato fayl o'zgartirilmasdan qayta yuklansa — qaysi batch'da xato topilgani aytiladi.
    const again = await upload('employees', file).expect(409);
    expect(again.body.code).toBe('FILE_ALREADY_IMPORTED');
    expect(again.body.message).toContain(`#${batch.id}`);
    expect(again.body.message).toContain('xato');
  });

  it('ishdan_ketgan_sana: ochiq lavozim/oylik yopiladi, isActive=false', async () => {
    const file = await buildWorkbook(EMPLOYEE_HEADER, [[e2, null, null, null, null, null, null, null, '2026-06-20']]);
    await upload('employees', file).expect(201);
    const employee = await employeeHistory(e2);
    expect(employee).toMatchObject({ isActive: false });
    expect(iso(employee.terminationDate)).toBe('2026-06-20');
    expect(employee.assignments.map((item) => iso(item.endDate))).toEqual(['2026-06-20']);
    expect(employee.salaryHistory.map((item) => iso(item.endDate))).toEqual(['2026-06-20']);
  });
});

describe('Fayl darajasidagi xatolar — batch yaratilmaydi', () => {
  it('Excel emas, sarlavha noto\'g\'ri, ma\'lumot yo\'q → 400 INVALID_FILE', async () => {
    const countBefore = await prisma.importBatch.count();
    const cases = [
      await upload('employees', Buffer.from('salom'), calc, 'xodimlar.xlsx'),
      await upload('employees', await buildWorkbook(['ism'], [['Ali']])),
      await upload('employees', await buildWorkbook(['xodim_kodi', 'oylk'], [['E1', 1]])),
      await upload('employees', await buildWorkbook(['xodim_kodi'], [])),
      await upload('employees', await buildWorkbook(['xodim_kodi'], [['E1']]), calc, 'xodimlar.csv'),
    ];
    for (const res of cases) {
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_FILE');
    }
    expect(await prisma.importBatch.count()).toBe(countBefore);
  });

  it('50 000 dan ko\'p qator → 400 INVALID_FILE', async () => {
    const rows = Array.from({ length: 50_001 }, (_, index) => [`E${index}`]);
    const res = await upload('employees', await buildWorkbook(['xodim_kodi'], rows)).expect(400);
    expect(res.body).toMatchObject({ code: 'INVALID_FILE', message: expect.stringContaining('50000') });
  }, 60_000);

  it('fayl yuborilmasa → 400 INVALID_FILE; noma\'lum tur → 404', async () => {
    const res = await request(app.getHttpServer()).post('/api/imports/employees').set('Authorization', `Bearer ${calc}`).expect(400);
    expect(res.body.code).toBe('INVALID_FILE');
    await upload('sales', await buildWorkbook(['a'], [['b']])).expect(404);
  });

  it('APPROVER yuklay olmaydi (403), lekin ro\'yxatni ko\'radi', async () => {
    await upload('products', await buildWorkbook(['mahsulot_kodi', 'nomi', 'guruh_kodi'], [['P', 'X', 'G']]), approver).expect(403);
    const list = await get('/imports?type=employees').expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.items[0]).toMatchObject({ importType: 'EMPLOYEES', importedBy: expect.any(String) });
  });
});

// ---------------------------------------------------------------------------

describe('TEAM_LINKS importi', () => {
  it('havolalar yaratiladi; qayta import (yangi qator bilan) — eskilari UNCHANGED', async () => {
    const [sup1, sup2, rep] = [uniqueName('T'), uniqueName('T'), uniqueName('T')];
    for (const code of [sup1, sup2, rep]) await prisma.employee.create({ data: { employeeCode: code } });
    const header = ['rahbar_kodi', 'xodim_kodi', 'turi', 'boshlanish_sanasi', 'tugash_sanasi'];

    const first = await upload('team-links', await buildWorkbook(header, [[sup1, rep, 'supervisor', '2026-01-10', null]])).expect(201);
    expect(first.body).toMatchObject({ importType: 'TEAM_LINKS', created: 1 });

    const second = await upload(
      'team-links',
      await buildWorkbook(header, [
        [sup1, rep, 'SUPERVISOR', '2026-01-10', null],
        [sup2, rep, 'SUPERVISOR', '2026-03-17', null],
      ]),
    ).expect(201);
    expect(second.body).toMatchObject({ created: 1, unchanged: 1 });

    const member = await prisma.employee.findUniqueOrThrow({ where: { employeeCode: rep } });
    const links = await prisma.teamLink.findMany({ where: { memberId: member.id }, orderBy: { startDate: 'asc' } });
    expect(links.map((link) => [iso(link.startDate), iso(link.endDate)])).toEqual([
      ['2026-01-10', '2026-03-16'],
      ['2026-03-17', null],
    ]);
    const rows = await prisma.importRow.findMany({ where: { batchId: BigInt(second.body.id) } });
    expect(rows.every((row) => row.employeeId === rep)).toBe(true);
  });
});

describe('PRODUCTS va CLIENTS importi', () => {
  it('mahsulot: guruh kodi bo\'yicha; yangilash va audit', async () => {
    const group = uniqueName('PG');
    await prisma.productGroup.create({ data: { name: group, code: group } });
    const [p1, p2] = [uniqueName('P'), uniqueName('P')];
    const header = ['mahsulot_kodi', 'nomi', 'guruh_kodi'];
    await upload('products', await buildWorkbook(header, [[p1, 'Choy', group], [p2, 'Qahva', group]])).expect(201);
    const res = await upload('products', await buildWorkbook(header, [[p1, "Ko'k choy", group]])).expect(201);
    expect(res.body).toMatchObject({ importType: 'PRODUCTS', updated: 1 });

    const product = await prisma.product.findUniqueOrThrow({ where: { code: p1 } });
    expect(product.name).toBe("Ko'k choy");
    const audit = await prisma.auditLog.findFirst({ where: { action: 'REFERENCE_UPDATE', entityType: 'products', entityId: product.id } });
    expect(audit?.oldData).toMatchObject({ name: 'Choy' });
  });

  it('mijoz: kategoriya ixtiyoriy', async () => {
    const category = uniqueName('CC');
    await prisma.clientCategory.create({ data: { name: category, code: category } });
    const [c1, c2] = [uniqueName('C'), uniqueName('C')];
    const res = await upload(
      'clients',
      await buildWorkbook(['mijoz_kodi', 'nomi', 'kategoriya_kodi'], [[c1, "Do'kon", category], [c2, 'Market', null]]),
    ).expect(201);
    expect(res.body).toMatchObject({ importType: 'CLIENTS', created: 2 });
    expect((await prisma.client.findUniqueOrThrow({ where: { code: c2 } })).clientCategoryId).toBeNull();
  });
});

describe('Shablonlar — GET /imports/templates/:type', () => {
  it('bo\'sh .xlsx — faqat sarlavha', async () => {
    const res = await get('/imports/templates/employees')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('spreadsheetml');
    expect(res.headers['content-disposition']).toContain('employees');
    const rows = await readFirstSheet(res.body as Buffer);
    expect(rows[0].cells).toEqual([
      'xodim_kodi',
      'familiya',
      'ism',
      'otasining_ismi',
      'ishga_kirgan_sana',
      'ishdan_ketgan_sana',
      'bolim_kodi',
      'lavozim_kodi',
      'lavozim_sanasi',
      'oylik',
      'oylik_sanasi',
    ]);
  });
});
