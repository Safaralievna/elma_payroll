/**
 * 5-bosqich E2E: KPI konstruktor — KPI, qoidalar, pog'onalar, filtrlar,
 * kpi_units, lavozimga biriktirish, override va xodimning amaldagi KPI'lari.
 *
 * Bazada 2025-dekabr davri CLOSED: 2025-12-31 gacha ta'sir qiladigan o'zgarish — 409 PERIOD_CLOSED.
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
let unit: { id: string; code: string };
let inactiveUnit: { id: string };
let product: { id: string };
let inactiveProduct: { id: string };
let priceType: { id: string };
let dept: { id: string };
let salesRep: { id: string; code: string };

const EXCEL_STEPS = [
  { minPercent: '70', maxPercent: '80', coefficient: '2', maxRewardPercent: '20' },
  { minPercent: '80', maxPercent: '90', coefficient: '3', maxRewardPercent: '30' },
  { minPercent: '90', maxPercent: '100', coefficient: '5', maxRewardPercent: '50' },
  { minPercent: '100', maxPercent: '150', coefficient: '1', maxRewardPercent: '50' },
];

beforeAll(async () => {
  useTestEnv();
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);
  calc = await tokenFor(app, (await createUser(prisma, { roles: ['CALCULATOR'] })).id);
  approver = await tokenFor(app, (await createUser(prisma, { roles: ['APPROVER'] })).id);
  admin = await tokenFor(app, (await createUser(prisma, { roles: ['ADMIN'] })).id);

  const unitCode = uniqueName('U').slice(0, 30);
  unit = { id: (await prisma.kpiUnit.create({ data: { code: unitCode, name: "So'm" } })).id.toString(), code: unitCode };
  inactiveUnit = {
    id: (await prisma.kpiUnit.create({ data: { code: uniqueName('U').slice(0, 30), name: 'Eski', isActive: false } })).id.toString(),
  };
  const group = await prisma.productGroup.create({ data: { code: uniqueName('G'), name: 'Guruh' } });
  product = { id: (await prisma.product.create({ data: { code: uniqueName('PR'), name: 'Logo salfetka', productGroupId: group.id } })).id.toString() };
  inactiveProduct = {
    id: (
      await prisma.product.create({ data: { code: uniqueName('PR'), name: 'Eski', productGroupId: group.id, isActive: false } })
    ).id.toString(),
  };
  priceType = { id: (await prisma.priceType.create({ data: { code: uniqueName('PT'), name: 'Ulgurji' } })).id.toString() };
  dept = { id: (await prisma.department.create({ data: { code: uniqueName('D'), name: "Bo'lim" } })).id.toString() };
  const position = async () => {
    const code = uniqueName('POS');
    return { id: (await prisma.position.create({ data: { code, name: code } })).id.toString(), code };
  };
  salesRep = await position();

  await prisma.payrollPeriod.upsert({
    where: { year_month: { year: 2025, month: 12 } },
    create: { year: 2025, month: 12, status: 'CLOSED' },
    update: { status: 'CLOSED' },
  });
});

afterAll(async () => {
  await app.close();
});

function http(token: string) {
  const server = app.getHttpServer();
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(server).get(`/api${url}`).set(auth),
    post: (url: string, body: object) => request(server).post(`/api${url}`).set(auth).send(body),
    put: (url: string, body: object) => request(server).put(`/api${url}`).set(auth).send(body),
    patch: (url: string, body: object) => request(server).patch(`/api${url}`).set(auth).send(body),
    delete: (url: string) => request(server).delete(`/api${url}`).set(auth),
  };
}

function stepKpi(extra: object = {}) {
  return {
    code: uniqueName('KPI'),
    name: 'Umumiy savdo hajmi',
    unitId: unit.id,
    calculationType: 'STEP',
    aggregation: 'SUM',
    sourceField: 'amount',
    factSource: 'EXCEL',
    rules: [{ name: 'Asosiy qoida', priority: 1, steps: EXCEL_STEPS }],
    ...extra,
  };
}

function percentKpi(extra: object = {}) {
  return {
    code: uniqueName('KPI'),
    name: 'Savdodan %',
    unitId: unit.id,
    calculationType: 'RESULT_PERCENTAGE',
    aggregation: 'SUM',
    sourceField: 'amount',
    factSource: 'EXCEL',
    rules: [
      {
        name: 'Ulgurji',
        priority: 1,
        configuration: { percent: 5 },
        filters: [
          { fieldName: 'price_type_id', operator: '=', values: [priceType.id] },
          { fieldName: 'product_id', operator: 'NOT_IN', values: [product.id] },
        ],
      },
      { name: 'Qolganlari', priority: 2, configuration: { percent: '2' } },
    ],
    ...extra,
  };
}

async function createKpi(body: object): Promise<{ id: string; code: string; rules: { id: string }[] }> {
  return (await http(calc).post('/kpis', body).expect(201)).body;
}

async function newEmployee(positionId: string, startDate = '2026-01-01'): Promise<string> {
  const code = uniqueName('E');
  await http(calc).post('/employees', { employeeCode: code }).expect(201);
  await http(calc).post(`/employees/${code}/assignments`, { departmentId: dept.id, positionId, startDate }).expect(201);
  return code;
}

const issuePaths = (body: { details: { path: string }[] }) => body.details.map((issue) => issue.path);

// ---------------------------------------------------------------------------

describe("O'lchov birliklari — /kpi-units", () => {
  it('CALCULATOR yaratadi va tahrirlaydi; ADMIN va APPROVER faqat o\'qiydi', async () => {
    const code = uniqueName('SOAT').slice(0, 30);
    const created = await http(calc).post('/kpi-units', { code, name: 'Soat', description: 'Ish soati' }).expect(201);
    expect(created.body).toMatchObject({ code, name: 'Soat', description: 'Ish soati', isActive: true });
    await http(admin).post('/kpi-units', { code: uniqueName('X').slice(0, 30), name: 'X' }).expect(403);
    await http(approver).get(`/kpi-units/${created.body.id}`).expect(200);
    const updated = await http(calc).patch(`/kpi-units/${created.body.id}`, { isActive: false }).expect(200);
    expect(updated.body.isActive).toBe(false);
    expect((await http(calc).post('/kpi-units', { code, name: 'Yana' }).expect(409)).body.code).toBe('CODE_TAKEN');
  });
});

// ---------------------------------------------------------------------------

describe('KPI yaratish — POST /kpis', () => {
  it("STEP KPI qoida va pog'onalari bilan bitta tranzaksiyada; audit yoziladi", async () => {
    const body = stepKpi();
    const res = await http(calc).post('/kpis', body).expect(201);
    expect(res.body).toMatchObject({
      code: body.code,
      unitCode: unit.code,
      calculationType: 'STEP',
      aggregation: 'SUM',
      sourceField: 'amount',
      scope: 'OWN',
      teamLinkType: null,
      factSource: 'EXCEL',
      isActive: true,
      rules: [{ name: 'Asosiy qoida', priority: 1, isActive: true, configuration: {}, filters: [] }],
      positions: [],
    });
    expect(res.body.rules[0].steps).toEqual(EXCEL_STEPS);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'KPI_CREATE', entityId: BigInt(res.body.id) } });
    expect(audit?.newData).toMatchObject({ code: body.code, rules: [{ name: 'Asosiy qoida' }] });
  });

  it("filtrlar ID va nomi bilan ko'rinadi; configuration satrga keltiriladi", async () => {
    const res = await http(calc).post('/kpis', percentKpi()).expect(201);
    expect(res.body.rules[0].configuration).toEqual({ percent: '5' });
    expect(res.body.rules[0].filters[1]).toMatchObject({
      fieldName: 'product_id',
      operator: 'NOT_IN',
      values: [product.id],
      references: [{ id: product.id, name: 'Logo salfetka' }],
    });
    const got = await http(approver).get(`/kpis/${res.body.code}`).expect(200);
    expect(got.body).toEqual(res.body);
  });

  it('noto\'g\'ri konfiguratsiya — 400 INVALID_CONFIGURATION, hamma xatolar details\'da, hech narsa yozilmaydi', async () => {
    const body = stepKpi({
      scope: 'TEAM',
      factSource: 'ERP',
      rules: [{ name: 'A', priority: 1, steps: [{ minPercent: '80', maxPercent: '70', coefficient: '1' }] }],
    });
    const res = await http(calc).post('/kpis', body).expect(400);
    expect(res.body.code).toBe('INVALID_CONFIGURATION');
    expect(issuePaths(res.body).sort()).toEqual(['factSource', 'rules.0.steps.0.maxPercent', 'teamLinkType']);
    expect(await prisma.kpiDefinition.count({ where: { code: body.code } })).toBe(0);
  });

  it("STEP KPI'da ikki faol qoida — 400 (DECISIONS 2.2)", async () => {
    const body = stepKpi({
      rules: [
        { name: 'A', priority: 1, steps: EXCEL_STEPS, filters: [{ fieldName: 'product_id', operator: '=', values: [product.id] }] },
        { name: 'B', priority: 2, steps: EXCEL_STEPS },
      ],
    });
    const res = await http(calc).post('/kpis', body).expect(400);
    expect(issuePaths(res.body)).toEqual(['rules']);
  });

  it('takroriy priority va filtrsiz qoidadan keyingi qoida — 400', async () => {
    const dup = percentKpi();
    (dup.rules[1] as { priority: number }).priority = 1;
    expect(issuePaths((await http(calc).post('/kpis', dup).expect(400)).body)).toEqual(['rules.1.priority']);

    const unreachable = percentKpi();
    unreachable.rules[0].priority = 3;
    expect(issuePaths((await http(calc).post('/kpis', unreachable).expect(400)).body)).toEqual(['rules.0.priority']);
  });

  it("filtrdagi ID yo'q — 404 REFERENCE_NOT_FOUND, nofaol — 409 REFERENCE_INACTIVE", async () => {
    const withProduct = (id: string) =>
      percentKpi({
        rules: [{ name: 'A', priority: 1, configuration: { percent: 1 }, filters: [{ fieldName: 'product_id', operator: 'IN', values: [id] }] }],
      });
    expect((await http(calc).post('/kpis', withProduct('999999999')).expect(404)).body.code).toBe('REFERENCE_NOT_FOUND');
    expect((await http(calc).post('/kpis', withProduct(inactiveProduct.id)).expect(409)).body.code).toBe('REFERENCE_INACTIVE');
  });

  it("birlik yo'q yoki nofaol; kod band; APPROVER yarata olmaydi", async () => {
    expect((await http(calc).post('/kpis', stepKpi({ unitId: '999999999' })).expect(404)).body.code).toBe('REFERENCE_NOT_FOUND');
    expect((await http(calc).post('/kpis', stepKpi({ unitId: inactiveUnit.id })).expect(409)).body.code).toBe('REFERENCE_INACTIVE');
    const kpi = await createKpi(stepKpi());
    expect((await http(calc).post('/kpis', stepKpi({ code: kpi.code })).expect(409)).body.code).toBe('CODE_TAKEN');
    await http(approver).post('/kpis', stepKpi()).expect(403);
  });
});

// ---------------------------------------------------------------------------

describe('KPI ro\'yxati va tahrirlash — GET /kpis, PATCH /kpis/:code', () => {
  it("ro'yxat: qidiruv va hisoblash turi bo'yicha filtr", async () => {
    const kpi = await createKpi(percentKpi());
    const res = await http(approver).get(`/kpis?search=${kpi.code}&calculationType=RESULT_PERCENTAGE`).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]).toMatchObject({ code: kpi.code, calculationType: 'RESULT_PERCENTAGE', ruleCount: 2 });
    expect((await http(approver).get(`/kpis?search=${kpi.code}&calculationType=STEP`).expect(200)).body.total).toBe(0);
    expect((await http(approver).get('/kpis/YOQ_KPI').expect(404)).body.code).toBe('NOT_FOUND');
  });

  it("nom va tavsif o'zgaradi (audit); tuzilma o'zgarsa hamma qoida qayta tekshiriladi", async () => {
    const kpi = await createKpi(stepKpi());
    const res = await http(calc).patch(`/kpis/${kpi.code}`, { name: 'Yangi nom', description: 'Izoh' }).expect(200);
    expect(res.body).toMatchObject({ name: 'Yangi nom', description: 'Izoh' });
    const audit = await prisma.auditLog.findFirst({ where: { action: 'KPI_UPDATE', entityId: BigInt(kpi.id) } });
    expect(audit?.oldData).toMatchObject({ name: 'Umumiy savdo hajmi' });
    expect(audit?.newData).toMatchObject({ name: 'Yangi nom' });

    // STEP qoidasida pog'onalar bor — RESULT_PERCENTAGE'ga o'tsa percent yo'q va pog'onalar ortiqcha.
    const bad = await http(calc).patch(`/kpis/${kpi.code}`, { calculationType: 'RESULT_PERCENTAGE' }).expect(400);
    expect(bad.body.code).toBe('INVALID_CONFIGURATION');
    expect(issuePaths(bad.body).sort()).toEqual(
      [`rules[id=${kpi.rules[0].id}].configuration.percent`, `rules[id=${kpi.rules[0].id}].steps`].sort(),
    );

    const team = await http(calc).patch(`/kpis/${kpi.code}`, { scope: 'TEAM', teamLinkType: 'SUPERVISOR' }).expect(200);
    expect(team.body).toMatchObject({ scope: 'TEAM', teamLinkType: 'SUPERVISOR' });
    await http(calc).patch(`/kpis/${kpi.code}`, { code: 'BOSHQA' }).expect(400);
  });

  it("natijasi bor KPI'ning tuzilmasi o'zgarmaydi — 409 KPI_IN_USE; nomi o'zgaradi", async () => {
    const kpi = await createKpi(stepKpi());
    await insertResult(BigInt(kpi.id), BigInt(kpi.rules[0].id));
    const res = await http(calc).patch(`/kpis/${kpi.code}`, { aggregation: 'COUNT_DISTINCT_POSITIVE', sourceField: 'client_id' }).expect(409);
    expect(res.body.code).toBe('KPI_IN_USE');
    await http(calc).patch(`/kpis/${kpi.code}`, { name: 'Boshqa nom' }).expect(200);
  });

  it("ochiq biriktirishi bor KPI nofaol qilinmaydi — 409 KPI_IN_USE", async () => {
    const kpi = await createKpi(stepKpi());
    const link = await http(calc)
      .post('/position-kpis', { positionId: salesRep.id, kpiId: kpi.id, startDate: '2026-01-01' })
      .expect(201);
    expect((await http(calc).patch(`/kpis/${kpi.code}`, { isActive: false }).expect(409)).body.code).toBe('KPI_IN_USE');
    await http(calc).patch(`/position-kpis/${link.body.id}`, { endDate: '2026-06-30' }).expect(200);
    expect((await http(calc).patch(`/kpis/${kpi.code}`, { isActive: false }).expect(200)).body.isActive).toBe(false);
  });
});

/** kpi_results + kpi_result_rules — 8-bosqich yozadigan natija (shu testlar uchun qo'lda). */
async function insertResult(kpiId: bigint, ruleId: bigint): Promise<void> {
  const period = await prisma.payrollPeriod.upsert({
    where: { year_month: { year: 2025, month: 12 } },
    create: { year: 2025, month: 12, status: 'CLOSED' },
    update: {},
  });
  const employee = await prisma.employee.create({ data: { employeeCode: uniqueName('R') } });
  const result = await prisma.kpiResult.create({
    data: { periodId: period.id, employeeId: employee.id, kpiId, kpiAmount: 0 },
  });
  await prisma.kpiResultRule.create({ data: { kpiResultId: result.id, kpiRuleId: ruleId, amount: 0 } });
}

// ---------------------------------------------------------------------------

describe('Qoidalar — /kpis/:code/rules', () => {
  it("qo'shish, to'liq almashtirish (pog'ona va filtrlar qayta yoziladi), o'chirish; audit", async () => {
    const kpi = await createKpi(percentKpi());
    const salfetka = (priority: number, isActive = true) => ({
      name: 'Salfetka',
      priority,
      isActive,
      configuration: { percent: '1' },
      filters: [{ fieldName: 'product_id', operator: '=', values: [product.id] }],
    });
    // priority = 1 band.
    expect(issuePaths((await http(calc).post(`/kpis/${kpi.code}/rules`, salfetka(1)).expect(400)).body)).toEqual(['priority']);
    // 2-qoida filtrsiz — undan keyingi faol qoida hech qachon ishlamaydi.
    expect(issuePaths((await http(calc).post(`/kpis/${kpi.code}/rules`, salfetka(5)).expect(400)).body)).toEqual(['priority']);

    const third = await http(calc).post(`/kpis/${kpi.code}/rules`, salfetka(3, false)).expect(201);
    expect(third.body).toMatchObject({ priority: 3, isActive: false, configuration: { percent: '1' } });
    expect(
      await prisma.auditLog.count({ where: { action: 'KPI_RULE_CREATE', entityId: BigInt(third.body.id) } }),
    ).toBe(1);

    const replaced = await http(calc)
      .put(`/kpis/${kpi.code}/rules/${kpi.rules[1].id}`, {
        name: 'Chakana',
        priority: 2,
        configuration: { percent: '10' },
        filters: [{ fieldName: 'amount', operator: '>=', values: ['100000'] }],
      })
      .expect(200);
    expect(replaced.body).toMatchObject({
      id: kpi.rules[1].id,
      name: 'Chakana',
      configuration: { percent: '10' },
      filters: [{ fieldName: 'amount', operator: '>=', values: ['100000'], references: null }],
    });
    expect(await prisma.kpiRuleFilter.count({ where: { kpiRuleId: BigInt(kpi.rules[1].id) } })).toBe(1);
    const updateAudit = await prisma.auditLog.findFirst({ where: { action: 'KPI_RULE_UPDATE', entityId: BigInt(kpi.rules[1].id) } });
    expect(updateAudit?.oldData).toMatchObject({ name: 'Qolganlari' });

    await http(calc).delete(`/kpis/${kpi.code}/rules/${third.body.id}`).expect(204);
    expect(await prisma.kpiRule.count({ where: { id: BigInt(third.body.id) } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'KPI_RULE_DELETE', entityId: BigInt(third.body.id) } })).toBe(1);
  });

  it("oxirgi faol qoidani o'chirib yoki nofaol qilib bo'lmaydi — 400", async () => {
    const kpi = await createKpi(stepKpi());
    expect(issuePaths((await http(calc).delete(`/kpis/${kpi.code}/rules/${kpi.rules[0].id}`).expect(400)).body)).toEqual([
      'rules',
    ]);
    const off = await http(calc)
      .put(`/kpis/${kpi.code}/rules/${kpi.rules[0].id}`, { name: 'A', priority: 1, isActive: false, steps: EXCEL_STEPS })
      .expect(400);
    expect(issuePaths(off.body)).toEqual(['rules']);
  });

  it("natijasi bor qoida o'chirilmaydi — 409 RULE_IN_USE; boshqa KPI'ning qoidasi — 404", async () => {
    const kpi = await createKpi(percentKpi());
    await insertResult(BigInt(kpi.id), BigInt(kpi.rules[0].id));
    expect((await http(calc).delete(`/kpis/${kpi.code}/rules/${kpi.rules[0].id}`).expect(409)).body.code).toBe('RULE_IN_USE');
    const other = await createKpi(stepKpi());
    await http(calc).delete(`/kpis/${other.code}/rules/${kpi.rules[1].id}`).expect(404);
    await http(approver).delete(`/kpis/${kpi.code}/rules/${kpi.rules[1].id}`).expect(403);
  });
});

// ---------------------------------------------------------------------------

describe('Lavozimga biriktirish — /position-kpis', () => {
  it("yaratish, ro'yxat, yopish, o'chirish; audit HISTORY_*", async () => {
    const kpi = await createKpi(stepKpi());
    const res = await http(calc)
      .post('/position-kpis', { positionId: salesRep.id, kpiId: kpi.id, startDate: '2026-01-01' })
      .expect(201);
    expect(res.body).toMatchObject({
      positionId: salesRep.id,
      positionCode: salesRep.code,
      kpiId: kpi.id,
      kpiCode: kpi.code,
      startDate: '2026-01-01',
      endDate: null,
      isActive: true,
    });
    const list = await http(approver).get(`/position-kpis?kpiId=${kpi.id}`).expect(200);
    expect(list.body.map((item: { id: string }) => item.id)).toEqual([res.body.id]);
    expect((await http(approver).get(`/kpis/${kpi.code}`).expect(200)).body.positions).toHaveLength(1);

    await http(calc).patch(`/position-kpis/${res.body.id}`, { endDate: '2026-03-31' }).expect(200);
    const created = await prisma.auditLog.findFirst({ where: { action: 'HISTORY_CREATE', entityType: 'position_kpis', entityId: BigInt(res.body.id) } });
    expect(created?.newData).toMatchObject({ kpiCode: kpi.code, startDate: '2026-01-01' });
    const updated = await prisma.auditLog.findFirst({ where: { action: 'HISTORY_UPDATE', entityType: 'position_kpis', entityId: BigInt(res.body.id) } });
    expect(updated?.newData).toMatchObject({ endDate: '2026-03-31' });

    await http(calc).delete(`/position-kpis/${res.body.id}`).expect(204);
    expect(await prisma.positionKpi.count({ where: { id: BigInt(res.body.id) } })).toBe(0);
    expect(
      await prisma.auditLog.count({ where: { action: 'HISTORY_DELETE', entityType: 'position_kpis', entityId: BigInt(res.body.id) } }),
    ).toBe(1);
  });

  it('sana qoidalari: oy boshi/oxiri, ustma-ust, yopilgan davr', async () => {
    const kpi = await createKpi(stepKpi());
    const post = (body: object) => http(calc).post('/position-kpis', { positionId: salesRep.id, kpiId: kpi.id, ...body });
    expect((await post({ startDate: '2026-01-15' }).expect(400)).body.code).toBe('START_NOT_MONTH_START');
    expect((await post({ startDate: '2026-01-01', endDate: '2026-01-30' }).expect(400)).body.code).toBe('END_NOT_MONTH_END');
    expect((await post({ startDate: '2025-12-01' }).expect(409)).body.code).toBe('PERIOD_CLOSED');
    await post({ startDate: '2026-01-01', endDate: '2026-02-28' }).expect(201);
    expect((await post({ startDate: '2026-02-01' }).expect(409)).body.code).toBe('HISTORY_OVERLAP');
    await post({ startDate: '2026-03-01' }).expect(201);
  });

  it('nofaol KPI yoki lavozim — 409 REFERENCE_INACTIVE; APPROVER yoza olmaydi', async () => {
    const kpi = await createKpi(stepKpi({ isActive: false }));
    const res = await http(calc).post('/position-kpis', { positionId: salesRep.id, kpiId: kpi.id, startDate: '2026-01-01' }).expect(409);
    expect(res.body.code).toBe('REFERENCE_INACTIVE');
    await http(approver).post('/position-kpis', { positionId: salesRep.id, kpiId: kpi.id, startDate: '2026-01-01' }).expect(403);
  });
});

// ---------------------------------------------------------------------------

describe('Override va amaldagi KPI\'lar — /employees/:code/kpi-overrides, /employees/:code/kpis', () => {
  it("lavozim KPI'lari + ADD − REMOVE; oy bo'yicha", async () => {
    // Boshqa testlar umumiy lavozimlarga ham KPI biriktiradi — bu test o'z lavozimlari bilan.
    const rep = (await prisma.position.create({ data: { code: uniqueName('POS'), name: 'Savdo vakili' } })).id.toString();
    const sup = (await prisma.position.create({ data: { code: uniqueName('POS'), name: 'Supervayzer' } })).id.toString();
    const own = await createKpi(stepKpi());
    const removed = await createKpi(percentKpi());
    const extra = await createKpi(percentKpi());
    const supervisorKpi = await createKpi(stepKpi());
    for (const kpiId of [own.id, removed.id]) {
      await http(calc).post('/position-kpis', { positionId: rep, kpiId, startDate: '2026-01-01' }).expect(201);
    }
    await http(calc).post('/position-kpis', { positionId: sup, kpiId: supervisorKpi.id, startDate: '2026-01-01' }).expect(201);

    const code = await newEmployee(rep);
    await http(calc).post(`/employees/${code}/assignments`, { departmentId: dept.id, positionId: sup, startDate: '2026-05-01' }).expect(201);

    const remove = await http(calc)
      .post(`/employees/${code}/kpi-overrides`, { kpiId: removed.id, action: 'REMOVE', startDate: '2026-03-01' })
      .expect(201);
    expect(remove.body).toMatchObject({ employeeCode: code, kpiCode: removed.code, action: 'REMOVE', startDate: '2026-03-01' });
    await http(calc)
      .post(`/employees/${code}/kpi-overrides`, { kpiId: extra.id, action: 'ADD', startDate: '2026-03-01', endDate: '2026-03-31' })
      .expect(201);

    const month = async (m: number) => (await http(approver).get(`/employees/${code}/kpis?year=2026&month=${m}`).expect(200)).body;
    const feb = await month(2);
    expect(feb.kpis.map((k: { code: string; source: string }) => [k.code, k.source]).sort()).toEqual(
      [
        [own.code, 'POSITION'],
        [removed.code, 'POSITION'],
      ].sort(),
    );
    const mar = await month(3);
    expect(mar.kpis.map((k: { code: string; source: string }) => [k.code, k.source]).sort()).toEqual(
      [
        [own.code, 'POSITION'],
        [extra.code, 'ADD'],
      ].sort(),
    );
    expect(mar.removed.map((k: { code: string }) => k.code)).toEqual([removed.code]);
    const may = await month(5);
    expect(may.kpis.map((k: { code: string }) => k.code)).toEqual([supervisorKpi.code]);

    const list = await http(approver).get(`/employees/${code}/kpi-overrides`).expect(200);
    expect(list.body).toHaveLength(2);
  });

  it('ADD va REMOVE bir KPI uchun ustma-ust tushmaydi; yopish, o\'chirish; boshqa xodimning yozuvi — 404', async () => {
    const kpi = await createKpi(percentKpi());
    const code = await newEmployee(salesRep.id);
    const add = await http(calc)
      .post(`/employees/${code}/kpi-overrides`, { kpiId: kpi.id, action: 'ADD', startDate: '2026-01-01' })
      .expect(201);
    const clash = await http(calc)
      .post(`/employees/${code}/kpi-overrides`, { kpiId: kpi.id, action: 'REMOVE', startDate: '2026-04-01' })
      .expect(409);
    expect(clash.body.code).toBe('HISTORY_OVERLAP');

    await http(calc).patch(`/employees/${code}/kpi-overrides/${add.body.id}`, { endDate: '2026-03-31' }).expect(200);
    await http(calc)
      .post(`/employees/${code}/kpi-overrides`, { kpiId: kpi.id, action: 'REMOVE', startDate: '2026-04-01' })
      .expect(201);

    const other = await newEmployee(salesRep.id);
    await http(calc).delete(`/employees/${other}/kpi-overrides/${add.body.id}`).expect(404);
    await http(calc).delete(`/employees/${code}/kpi-overrides/${add.body.id}`).expect(204);
    await http(approver).post(`/employees/${code}/kpi-overrides`, { kpiId: kpi.id, action: 'ADD', startDate: '2026-09-01' }).expect(403);
    expect(
      (await http(calc).post(`/employees/YOQ/kpi-overrides`, { kpiId: kpi.id, action: 'ADD', startDate: '2026-09-01' }).expect(404)).body
        .code,
    ).toBe('EMPLOYEE_NOT_FOUND');
  });

  it("yopilgan davrga tegadigan override — 409 PERIOD_CLOSED; noto'g'ri oy — 400", async () => {
    const kpi = await createKpi(percentKpi());
    const code = await newEmployee(salesRep.id);
    const res = await http(calc)
      .post(`/employees/${code}/kpi-overrides`, { kpiId: kpi.id, action: 'ADD', startDate: '2025-11-01' })
      .expect(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
    await http(approver).get(`/employees/${code}/kpis?year=2026&month=13`).expect(400);
  });
});

// ---------------------------------------------------------------------------

describe('Yopilgan davr himoyasi — DELETE va PATCH (DECISIONS 2.5, 4-bosqich qoidasi bilan bir xil)', () => {
  // Bazada 2025-dekabr CLOSED. API yopilgan davrdan boshlanadigan yozuv yaratmaydi —
  // shuning uchun "eski" yozuv (2025-noyabrdan) to'g'ridan-to'g'ri bazaga qo'yiladi.
  async function freshPositionAndKpi(): Promise<{ positionId: bigint; kpi: { id: string; code: string } }> {
    const position = await prisma.position.create({ data: { code: uniqueName('POS'), name: 'Lavozim' } });
    return { positionId: position.id, kpi: await createKpi(stepKpi()) };
  }

  const auditCount = (action: 'HISTORY_DELETE' | 'HISTORY_UPDATE', entityType: string, id: bigint | string) =>
    prisma.auditLog.count({ where: { action, entityType, entityId: BigInt(id) } });

  it('position-kpis: CLOSED davrga tegsa DELETE va PATCH — 409; OPEN oylarda — o\'tadi, audit yoziladi', async () => {
    const { positionId, kpi } = await freshPositionAndKpi();
    const old = await prisma.positionKpi.create({
      data: { positionId, kpiId: BigInt(kpi.id), startDate: new Date('2025-11-01'), endDate: new Date('2026-03-31') },
    });

    // DELETE: davri (2025-11..2026-03) yopilgan dekabrga tegadi.
    expect((await http(calc).delete(`/position-kpis/${old.id}`).expect(409)).body.code).toBe('PERIOD_CLOSED');
    expect(await prisma.positionKpi.count({ where: { id: old.id } })).toBe(1);
    expect(await auditCount('HISTORY_DELETE', 'position_kpis', old.id)).toBe(0);

    // PATCH: yangi sana yopilgan noyabrda — 409; eski va yangi sana ochiq oylarda — o'tadi.
    expect((await http(calc).patch(`/position-kpis/${old.id}`, { endDate: '2025-11-30' }).expect(409)).body.code).toBe(
      'PERIOD_CLOSED',
    );
    await http(calc).patch(`/position-kpis/${old.id}`, { endDate: '2026-05-31' }).expect(200);
    expect(await auditCount('HISTORY_UPDATE', 'position_kpis', old.id)).toBe(1);

    // OPEN: 2026-yildan boshlangan yozuv — PATCH va DELETE o'tadi, DELETE auditga yoziladi.
    const open = await http(calc)
      .post('/position-kpis', { positionId: positionId.toString(), kpiId: kpi.id, startDate: '2026-07-01' })
      .expect(201);
    await http(calc).patch(`/position-kpis/${open.body.id}`, { endDate: '2026-09-30' }).expect(200);
    await http(calc).delete(`/position-kpis/${open.body.id}`).expect(204);
    expect(await auditCount('HISTORY_DELETE', 'position_kpis', open.body.id)).toBe(1);
  });

  it("kpi-overrides: CLOSED davrga tegsa DELETE va PATCH — 409; OPEN oylarda — o'tadi, audit yoziladi", async () => {
    const kpi = await createKpi(percentKpi());
    const code = await newEmployee(salesRep.id);
    const employee = await prisma.employee.findUniqueOrThrow({ where: { employeeCode: code } });
    const old = await prisma.employeeKpiOverride.create({
      data: { employeeId: employee.id, kpiId: BigInt(kpi.id), action: 'ADD', startDate: new Date('2025-11-01') },
    });
    const url = `/employees/${code}/kpi-overrides`;

    expect((await http(calc).delete(`${url}/${old.id}`).expect(409)).body.code).toBe('PERIOD_CLOSED');
    expect(await prisma.employeeKpiOverride.count({ where: { id: old.id } })).toBe(1);
    expect(await auditCount('HISTORY_DELETE', 'employee_kpi_overrides', old.id)).toBe(0);

    // Ochiq yozuvni dekabr oxirida yopish yopilgan dekabrga tegmaydi (2026-01-01 dan ta'sir qiladi),
    // noyabr oxirida yopish esa tegadi.
    expect((await http(calc).patch(`${url}/${old.id}`, { endDate: '2025-11-30' }).expect(409)).body.code).toBe('PERIOD_CLOSED');
    await http(calc).patch(`${url}/${old.id}`, { endDate: '2026-02-28' }).expect(200);
    expect(await auditCount('HISTORY_UPDATE', 'employee_kpi_overrides', old.id)).toBe(1);

    const open = await http(calc).post(url, { kpiId: kpi.id, action: 'REMOVE', startDate: '2026-04-01' }).expect(201);
    await http(calc).patch(`${url}/${open.body.id}`, { endDate: '2026-06-30' }).expect(200);
    await http(calc).delete(`${url}/${open.body.id}`).expect(204);
    expect(await prisma.employeeKpiOverride.count({ where: { id: BigInt(open.body.id) } })).toBe(0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'HISTORY_DELETE', entityType: 'employee_kpi_overrides', entityId: BigInt(open.body.id) },
    });
    expect(audit?.oldData).toMatchObject({ employeeCode: code, kpiCode: kpi.code, action: 'REMOVE', startDate: '2026-04-01' });
  });
});
