/**
 * 6-bosqich E2E: plan (qo'lda va Excel'dan), DECISIONS 2.1 va 6.
 *
 * Test boshqa fayllarga ta'sir qilmasligi uchun:
 * - kodlar uniqueName bilan; ish oylari 2030-yilda (boshqa testlar u yerga tegmaydi);
 * - 2025-12 dan keyingi oy CLOSED qilinmaydi (lastClosedDay butun baza bo'yicha);
 * - yaratilgan hamma narsa afterAll'da o'chiriladi (audit_logs bundan mustasno — uni o'chirib bo'lmaydi,
 *   foydalanuvchilar esa audit'ga FK orqali bog'langani uchun nofaol qilinadi).
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { buildWorkbook } from '../../src/imports/excel/workbook';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, createUser, ensureRoles, tokenFor, uniqueName, useTestEnv } from './app-helpers';

let app: INestApplication;
let prisma: PrismaService;
let calc: string;
let approver: string;
let admin: string;
const userIds: bigint[] = [];

const created = {
  periodIds: [] as bigint[],
  employeeIds: [] as bigint[],
  kpiIds: [] as bigint[],
  positionId: 0n,
  departmentId: 0n,
  unitId: 0n,
};
let periodIdsBefore = new Set<bigint>();

/** Lavozimga biriktirilgan xodim, biriktirilmagan xodim. */
let rep: string;
let outsider: string;
let kpi: { step: Kpi; manual: Kpi; fixed: Kpi; perUnit: Kpi };
interface Kpi {
  id: string;
  code: string;
}

const PLAN_HEADER = ['xodim_kodi', 'kpi_kodi', 'plan', 'baza_summa', 'qolda_summa'];

beforeAll(async () => {
  useTestEnv();
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);
  const calcUser = await createUser(prisma, { roles: ['CALCULATOR'] });
  const approverUser = await createUser(prisma, { roles: ['APPROVER'] });
  const adminUser = await createUser(prisma, { roles: ['ADMIN'] });
  userIds.push(calcUser.id, approverUser.id, adminUser.id);
  calc = await tokenFor(app, calcUser.id);
  approver = await tokenFor(app, approverUser.id);
  admin = await tokenFor(app, adminUser.id);

  // Umumiy yopilgan davr (boshqa fayllar ham shuni ishlatadi) — o'chirilmaydi.
  await prisma.payrollPeriod.upsert({
    where: { year_month: { year: 2025, month: 12 } },
    create: { year: 2025, month: 12, status: 'CLOSED' },
    update: { status: 'CLOSED' },
  });
  periodIdsBefore = new Set((await prisma.payrollPeriod.findMany({ select: { id: true } })).map((period) => period.id));

  created.unitId = (await prisma.kpiUnit.create({ data: { code: uniqueName('U').slice(0, 30), name: "So'm" } })).id;
  created.departmentId = (await prisma.department.create({ data: { code: uniqueName('D'), name: "Bo'lim" } })).id;
  const positionCode = uniqueName('POS');
  created.positionId = (await prisma.position.create({ data: { code: positionCode, name: positionCode } })).id;

  rep = uniqueName('E');
  outsider = uniqueName('E');
  const repRow = await prisma.employee.create({ data: { employeeCode: rep, lastName: 'Aliyev', firstName: 'Vali' } });
  const outsiderRow = await prisma.employee.create({ data: { employeeCode: outsider } });
  created.employeeIds.push(repRow.id, outsiderRow.id);
  await prisma.employeeAssignment.create({
    data: {
      employeeId: repRow.id,
      departmentId: created.departmentId,
      positionId: created.positionId,
      startDate: new Date('2026-01-01'),
    },
  });

  const unitId = created.unitId.toString();
  const sales = { aggregation: 'SUM', sourceField: 'amount', factSource: 'EXCEL', unitId };
  kpi = {
    step: await createKpi({ ...sales, name: 'Savdo', calculationType: 'STEP', rules: [{ name: 'Asosiy', priority: 1, steps: [{ minPercent: '70', maxPercent: '100', coefficient: '1', maxRewardPercent: '30' }] }] }),
    manual: await createKpi({ unitId, name: 'Qarzdorlar', calculationType: 'MANUAL', factSource: 'MANUAL', rules: [{ name: 'Qo\'lda', priority: 1 }] }),
    fixed: await createKpi({ ...sales, name: 'Bonus', calculationType: 'FIXED', rules: [{ name: 'Shart', priority: 1, configuration: { min_achievement: 100, amount: 500000 } }] }),
    perUnit: await createKpi({ ...sales, sourceField: 'quantity', name: 'Salfetka', calculationType: 'PER_UNIT', rules: [{ name: 'Dona', priority: 1, configuration: { rate_per_unit: 1000 } }] }),
  };
  for (const { id } of Object.values(kpi)) {
    await http(calc).post('/position-kpis', { positionId: created.positionId.toString(), kpiId: id, startDate: '2026-01-01' }).expect(201);
  }
});

afterAll(async () => {
  const periodIds = (await prisma.payrollPeriod.findMany({ select: { id: true } }))
    .map((period) => period.id)
    .filter((id) => !periodIdsBefore.has(id));
  const batchWhere = { importType: 'PLANS', periodId: { in: periodIds } };
  await prisma.kpiPlan.deleteMany({ where: { employeeId: { in: created.employeeIds } } });
  await prisma.validationError.deleteMany({ where: { importRow: { batch: batchWhere } } });
  await prisma.importRow.deleteMany({ where: { batch: batchWhere } });
  await prisma.importBatch.deleteMany({ where: batchWhere });
  await prisma.payrollPeriod.deleteMany({ where: { id: { in: periodIds } } });
  await prisma.positionKpi.deleteMany({ where: { positionId: created.positionId } });
  await prisma.kpiRuleStep.deleteMany({ where: { kpiRule: { kpiId: { in: created.kpiIds } } } });
  await prisma.kpiRuleFilter.deleteMany({ where: { kpiRule: { kpiId: { in: created.kpiIds } } } });
  await prisma.kpiRule.deleteMany({ where: { kpiId: { in: created.kpiIds } } });
  await prisma.kpiDefinition.deleteMany({ where: { id: { in: created.kpiIds } } });
  await prisma.employeeAssignment.deleteMany({ where: { employeeId: { in: created.employeeIds } } });
  await prisma.employee.deleteMany({ where: { id: { in: created.employeeIds } } });
  await prisma.position.delete({ where: { id: created.positionId } });
  await prisma.department.delete({ where: { id: created.departmentId } });
  await prisma.kpiUnit.delete({ where: { id: created.unitId } });
  // auth.db-spec.ts (LAST_ADMIN) bazada yagona faol ADMIN bo'lishini kutadi.
  await prisma.user.updateMany({ where: { id: { in: userIds } }, data: { isActive: false } });
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

async function createKpi(body: object): Promise<Kpi> {
  const response = await http(calc).post('/kpis', { code: uniqueName('KPI'), ...body });
  if (response.status !== 201) throw new Error(JSON.stringify(response.body));
  created.kpiIds.push(BigInt(response.body.id));
  return { id: response.body.id, code: response.body.code };
}

function uploadPlans(year: number, month: number, rows: unknown[][], token = calc) {
  return buildWorkbook(PLAN_HEADER, rows).then((buffer) =>
    request(app.getHttpServer())
      .post(`/api/imports/plans?year=${year}&month=${month}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'plan.xlsx'),
  );
}

async function auditFor(entityType: string, entityId: string) {
  return prisma.auditLog.findMany({ where: { entityType, entityId: BigInt(entityId) }, orderBy: { id: 'asc' } });
}

async function periodOf(year: number, month: number) {
  return prisma.payrollPeriod.findUnique({ where: { year_month: { year, month } } });
}

// ---------------------------------------------------------------------------

describe('qo\'lda kiritish: POST / PATCH / DELETE /employees/:code/kpi-plans', () => {
  it('CALCULATOR STEP planini yaratadi: davr avtomatik OPEN yaratiladi, audit — PERIOD_CREATE va PLAN_CREATE', async () => {
    expect(await periodOf(2030, 1)).toBeNull();
    const response = await http(calc)
      .post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 1, kpiId: kpi.step.id, planValue: '150000000', baseAmount: '1500000' })
      .expect(201);
    expect(response.body).toMatchObject({
      year: 2030,
      month: 1,
      employeeCode: rep,
      kpiId: kpi.step.id,
      kpiCode: kpi.step.code,
      calculationType: 'STEP',
      planValue: '150000000.0000',
      baseAmount: '1500000.00',
      manualAmount: null,
      source: 'MANUAL',
      importBatchId: null,
    });

    const period = (await periodOf(2030, 1))!;
    expect(period.status).toBe('OPEN');
    expect((await auditFor('payroll_periods', period.id.toString())).map((log) => log.action)).toEqual(['PERIOD_CREATE']);
    const logs = await auditFor('kpi_plans', response.body.id);
    expect(logs.map((log) => log.action)).toEqual(['PLAN_CREATE']);
    expect(logs[0]!.newData).toMatchObject({ planValue: '150000000.0000', baseAmount: '1500000.00' });
  });

  it('ikkinchi marta shu xodim + KPI + oy — 409 PLAN_EXISTS', async () => {
    const response = await http(calc).post(`/employees/${rep}/kpi-plans`, {
      year: 2030,
      month: 1,
      kpiId: kpi.step.id,
      planValue: '1',
      baseAmount: '1',
    });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PLAN_EXISTS');
  });

  it('PATCH: qiymat o\'zgaradi, audit eski/yangi bilan; o\'zgarish yo\'q — 409 NO_CHANGE, audit yozilmaydi', async () => {
    const plan = await http(calc)
      .post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 2, kpiId: kpi.fixed.id, planValue: '100' })
      .expect(201);
    const updated = await http(calc).patch(`/employees/${rep}/kpi-plans/${plan.body.id}`, { planValue: '120.5' }).expect(200);
    expect(updated.body.planValue).toBe('120.5000');

    const same = await http(calc).patch(`/employees/${rep}/kpi-plans/${plan.body.id}`, { planValue: '120.50' });
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('NO_CHANGE');

    const logs = await auditFor('kpi_plans', plan.body.id);
    expect(logs.map((log) => log.action)).toEqual(['PLAN_CREATE', 'PLAN_UPDATE']);
    expect(logs[1]!.oldData).toMatchObject({ planValue: '100.0000' });
    expect(logs[1]!.newData).toMatchObject({ planValue: '120.5000' });
  });

  it('DELETE: o\'chiriladi, audit PLAN_DELETE eski qiymat bilan', async () => {
    const plan = await http(calc)
      .post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 2, kpiId: kpi.manual.id, manualAmount: '250000' })
      .expect(201);
    await http(calc).delete(`/employees/${rep}/kpi-plans/${plan.body.id}`).expect(204);
    expect(await prisma.kpiPlan.findUnique({ where: { id: BigInt(plan.body.id) } })).toBeNull();
    const logs = await auditFor('kpi_plans', plan.body.id);
    expect(logs.map((log) => log.action)).toEqual(['PLAN_CREATE', 'PLAN_DELETE']);
    expect(logs[1]!.oldData).toMatchObject({ manualAmount: '250000.00' });
  });

  it('boshqa xodimning plan id\'si bilan — 404', async () => {
    const plan = await http(calc)
      .post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 3, kpiId: kpi.step.id, planValue: '10', baseAmount: '0' })
      .expect(201);
    expect((await http(calc).delete(`/employees/${outsider}/kpi-plans/${plan.body.id}`)).status).toBe(404);
  });

  it('validatsiya: majburiy/ortiqcha maydon, plan ≤ 0, ortiqcha kasr — 400 INVALID_PLAN (hamma xato birdaniga)', async () => {
    const response = await http(calc).post(`/employees/${rep}/kpi-plans`, {
      year: 2030,
      month: 4,
      kpiId: kpi.step.id,
      planValue: '0',
      baseAmount: '10.123',
      manualAmount: '5',
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_PLAN');
    expect(response.body.details).toEqual([
      { path: 'manualAmount', message: expect.stringContaining('kiritilmaydi') },
      { path: 'planValue', message: "0 dan katta bo'lishi kerak" },
      { path: 'baseAmount', message: "Ko'pi bilan 2 kasr belgisi bo'lishi mumkin" },
    ]);
    // Xato bo'lsa tranzaksiya bekor: davr ham yaratilmadi.
    expect(await periodOf(2030, 4)).toBeNull();
  });

  it('"1e5" kabi son — 400 VALIDATION_ERROR (faqat oddiy o\'nlik satr)', async () => {
    const response = await http(calc).post(`/employees/${rep}/kpi-plans`, {
      year: 2030,
      month: 4,
      kpiId: kpi.step.id,
      planValue: '1e5',
      baseAmount: '1',
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('plansiz tur (PER_UNIT) — 400 PLAN_NOT_APPLICABLE', async () => {
    const response = await http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 4, kpiId: kpi.perUnit.id, planValue: '5' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('PLAN_NOT_APPLICABLE');
  });

  it('KPI shu oy xodimga biriktirilmagan — 400 KPI_NOT_ASSIGNED', async () => {
    const response = await http(calc).post(`/employees/${outsider}/kpi-plans`, {
      year: 2030,
      month: 4,
      kpiId: kpi.step.id,
      planValue: '5',
      baseAmount: '1',
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('KPI_NOT_ASSIGNED');
  });

  it('bir vaqtdagi ikki so\'rov yangi oyga — davr bitta, PERIOD_CREATE bitta', async () => {
    const [a, b] = await Promise.all([
      http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 5, kpiId: kpi.step.id, planValue: '10', baseAmount: '1' }),
      http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 5, kpiId: kpi.manual.id, manualAmount: '1' }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const period = (await periodOf(2030, 5))!;
    expect((await auditFor('payroll_periods', period.id.toString())).map((log) => log.action)).toEqual(['PERIOD_CREATE']);
  });
});

describe('rollar', () => {
  it('APPROVER va ADMIN yoza olmaydi — 403; o\'qish — hamma rol', async () => {
    const body = { year: 2030, month: 1, kpiId: kpi.manual.id, manualAmount: '1' };
    expect((await http(approver).post(`/employees/${rep}/kpi-plans`, body)).status).toBe(403);
    expect((await http(admin).post(`/employees/${rep}/kpi-plans`, body)).status).toBe(403);
    expect((await uploadPlans(2030, 1, [[rep, kpi.manual.code, null, null, 1]], approver)).status).toBe(403);
    for (const token of [calc, approver, admin]) {
      await http(token).get(`/employees/${rep}/kpi-plans?year=2030&month=1`).expect(200);
      await http(token).get('/kpi-plans?year=2030&month=1').expect(200);
      await http(token).get('/kpi-plans/missing?year=2030&month=1').expect(200);
    }
  });
});

describe('davr himoyasi', () => {
  let closedPlanId: string;

  beforeAll(async () => {
    // Yopilgan davrdagi plan (8-bosqich hisoblagan bo'lardi) — to'g'ridan-to'g'ri bazaga.
    const period = (await periodOf(2025, 12))!;
    const row = await prisma.kpiPlan.create({
      data: { periodId: period.id, employeeId: created.employeeIds[0]!, kpiId: BigInt(kpi.step.id), planValue: 100, baseAmount: 1000 },
    });
    closedPlanId = row.id.toString();
  });

  it('CLOSED oy: POST, PATCH, DELETE — 409 PERIOD_CLOSED, baza va audit o\'zgarmaydi', async () => {
    const auditBefore = await prisma.auditLog.count();
    const post = await http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2025, month: 12, kpiId: kpi.manual.id, manualAmount: '1' });
    const patch = await http(calc).patch(`/employees/${rep}/kpi-plans/${closedPlanId}`, { planValue: '200' });
    const del = await http(calc).delete(`/employees/${rep}/kpi-plans/${closedPlanId}`);
    for (const response of [post, patch, del]) {
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('PERIOD_CLOSED');
    }
    const plan = await prisma.kpiPlan.findUniqueOrThrow({ where: { id: BigInt(closedPlanId) } });
    expect(plan.planValue?.toString()).toBe('100');
    expect(await prisma.auditLog.count()).toBe(auditBefore);
  });

  it('oxirgi yopilgan oydan oldingi, davri yo\'q oy — PERIOD_CLOSED, davr yaratilmaydi', async () => {
    const response = await http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2025, month: 6, kpiId: kpi.manual.id, manualAmount: '1' });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PERIOD_CLOSED');
    expect(await periodOf(2025, 6)).toBeNull();
  });

  it('REVIEW oy: yozish — 409 PERIOD_NOT_OPEN (qo\'lda ham, importda ham)', async () => {
    await prisma.payrollPeriod.create({ data: { year: 2030, month: 11, status: 'REVIEW' } });
    const post = await http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 11, kpiId: kpi.manual.id, manualAmount: '1' });
    expect(post.status).toBe(409);
    expect(post.body.code).toBe('PERIOD_NOT_OPEN');
    const upload = await uploadPlans(2030, 11, [[rep, kpi.manual.code, null, null, 1]]);
    expect(upload.status).toBe(409);
    expect(upload.body.code).toBe('PERIOD_NOT_OPEN');
  });

  it('CLOSED oyga import — 409 PERIOD_CLOSED, batch yaratilmaydi', async () => {
    const period = (await periodOf(2025, 12))!;
    const response = await uploadPlans(2025, 12, [[rep, kpi.manual.code, null, null, 1]]);
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('PERIOD_CLOSED');
    expect(await prisma.importBatch.count({ where: { periodId: period.id, importType: 'PLANS' } })).toBe(0);
  });
});

describe('Excel import: POST /imports/plans?year=&month=', () => {
  it('davr ko\'rsatilmasa — 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/imports/plans')
      .set('Authorization', `Bearer ${calc}`)
      .attach('file', await buildWorkbook(PLAN_HEADER, [[rep, kpi.manual.code, null, null, 1]]), 'plan.xlsx');
    expect(response.status).toBe(400);
  });

  it('to\'g\'ri fayl → ACTIVE; planlar import_batch_id bilan; qo\'lda kiritilgan va faylda yo\'q plan o\'zgarmaydi', async () => {
    const manual = await http(calc)
      .post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 6, kpiId: kpi.manual.id, manualAmount: '777' })
      .expect(201);

    const response = await uploadPlans(2030, 6, [
      [rep, kpi.step.code, 150000000, '1 500 000', null],
      [rep, kpi.fixed.code, 100, null, null],
    ]);
    if (response.status !== 201) throw new Error(JSON.stringify(response.body));
    expect(response.body).toMatchObject({ importType: 'PLANS', status: 'ACTIVE', versionNumber: 1, year: 2030, month: 6, created: 2 });

    const plans = await http(calc).get(`/employees/${rep}/kpi-plans?year=2030&month=6`).expect(200);
    const byKpi = new Map(plans.body.map((plan: { kpiCode: string }) => [plan.kpiCode, plan]));
    expect(byKpi.get(kpi.step.code)).toMatchObject({ planValue: '150000000.0000', baseAmount: '1500000.00', source: 'IMPORT', importBatchId: response.body.id });
    expect(byKpi.get(kpi.manual.code)).toMatchObject({ id: manual.body.id, manualAmount: '777.00', source: 'MANUAL' });

    const logs = await prisma.auditLog.findMany({ where: { entityType: 'kpi_plans', action: 'PLAN_CREATE', newData: { path: ['importBatchId'], equals: response.body.id } } });
    expect(logs).toHaveLength(2);
  });

  it('2-versiya: 1-versiya ARCHIVED; o\'zgargan plan UPDATED (audit eski/yangi), bir xili UNCHANGED', async () => {
    const response = await uploadPlans(2030, 6, [
      [rep, kpi.step.code, 160000000, 1500000, null],
      [rep, kpi.fixed.code, '100.00', null, null],
    ]);
    if (response.status !== 201) throw new Error(JSON.stringify(response.body));
    expect(response.body).toMatchObject({ status: 'ACTIVE', versionNumber: 2, created: 0, updated: 1, unchanged: 1 });
    const period = (await periodOf(2030, 6))!;
    const batches = await prisma.importBatch.findMany({ where: { periodId: period.id, importType: 'PLANS' }, orderBy: { versionNumber: 'asc' } });
    expect(batches.map((batch) => batch.status)).toEqual(['ARCHIVED', 'ACTIVE']);

    const plan = await prisma.kpiPlan.findFirstOrThrow({ where: { periodId: period.id, kpiId: BigInt(kpi.step.id) } });
    expect(plan.importBatchId?.toString()).toBe(response.body.id);
    const logs = await auditFor('kpi_plans', plan.id.toString());
    expect(logs.map((log) => log.action)).toEqual(['PLAN_CREATE', 'PLAN_UPDATE']);
    expect(logs[1]!.oldData).toMatchObject({ planValue: '150000000.0000' });
    expect(logs[1]!.newData).toMatchObject({ planValue: '160000000.0000' });
  });

  it('o\'sha faylni qayta yuklash — 409 FILE_ALREADY_IMPORTED', async () => {
    const rows = [[rep, kpi.step.code, 170000000, 1500000, null]];
    expect((await uploadPlans(2030, 7, rows)).status).toBe(201);
    const again = await uploadPlans(2030, 7, rows);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('FILE_ALREADY_IMPORTED');
  });

  it('bitta xato qator — batch INVALID, 422, hech bir plan yozilmaydi', async () => {
    const response = await uploadPlans(2030, 8, [
      [rep, kpi.step.code, 100, 1000, null],
      [outsider, kpi.step.code, 100, 1000, null],
    ]);
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('IMPORT_HAS_ERRORS');
    expect(response.body.details.errors).toEqual([
      expect.objectContaining({ rowNumber: 3, employeeCode: outsider, field: 'kpi_kodi', message: expect.stringContaining('biriktirilmagan') }),
    ]);
    const period = (await periodOf(2030, 8))!;
    expect(await prisma.kpiPlan.count({ where: { periodId: period.id } })).toBe(0);
    expect((await prisma.importBatch.findFirstOrThrow({ where: { periodId: period.id } })).status).toBe('INVALID');
  });

  it('qo\'lda PATCH qilingan import plani — manbasi MANUAL (import_batch_id = NULL)', async () => {
    const period = (await periodOf(2030, 7))!;
    const plan = await prisma.kpiPlan.findFirstOrThrow({ where: { periodId: period.id, kpiId: BigInt(kpi.step.id) } });
    expect(plan.importBatchId).not.toBeNull();
    const response = await http(calc).patch(`/employees/${rep}/kpi-plans/${plan.id}`, { baseAmount: '2000000' }).expect(200);
    expect(response.body).toMatchObject({ source: 'MANUAL', importBatchId: null, baseAmount: '2000000.00' });
  });

  it('import ro\'yxatida PLANS batch davri bilan ko\'rinadi', async () => {
    const list = await http(calc).get('/imports?type=plans').expect(200);
    expect(list.body.items.length).toBeGreaterThan(0);
    expect(list.body.items[0]).toMatchObject({ importType: 'PLANS', year: 2030 });
  });
});

describe('ro\'yxat va yetishmayotgan planlar', () => {
  it('GET /kpi-plans: davr bo\'yicha, filtrlar bilan', async () => {
    const all = await http(calc).get(`/kpi-plans?year=2030&month=6&employeeCode=${rep}`).expect(200);
    expect(all.body.total).toBe(3);
    const imported = await http(calc).get(`/kpi-plans?year=2030&month=6&source=IMPORT`).expect(200);
    expect(imported.body.items.every((plan: { source: string }) => plan.source === 'IMPORT')).toBe(true);
    const empty = await http(calc).get('/kpi-plans?year=2030&month=12').expect(200);
    expect(empty.body).toMatchObject({ items: [], total: 0 });
  });

  it('GET /kpi-plans/missing: plansiz STEP, FIXED, MANUAL ko\'rinadi; PER_UNIT va biriktirilmagan xodim — yo\'q', async () => {
    const response = await http(calc).get('/kpi-plans/missing?year=2030&month=9').expect(200);
    const mine = response.body.items.filter((item: { employeeCode: string }) => item.employeeCode === rep || item.employeeCode === outsider);
    expect(mine.map((item: { kpiCode: string; missing: string[] }) => [item.kpiCode, item.missing]).sort()).toEqual(
      [
        [kpi.fixed.code, ['planValue']],
        [kpi.manual.code, ['manualAmount']],
        [kpi.step.code, ['planValue', 'baseAmount']],
      ].sort(),
    );
    // GET davr yaratmaydi.
    expect(await periodOf(2030, 9)).toBeNull();
  });

  it('plan kiritilgach ro\'yxatdan chiqadi', async () => {
    await http(calc).post(`/employees/${rep}/kpi-plans`, { year: 2030, month: 9, kpiId: kpi.fixed.id, planValue: '100' }).expect(201);
    const response = await http(calc).get('/kpi-plans/missing?year=2030&month=9').expect(200);
    const codes = response.body.items.filter((item: { employeeCode: string }) => item.employeeCode === rep).map((item: { kpiCode: string }) => item.kpiCode);
    expect(codes).not.toContain(kpi.fixed.code);
    expect(codes).toContain(kpi.step.code);
  });
});
