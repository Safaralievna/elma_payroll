/**
 * 4-bosqich E2E: xodimlar, lavozim tarixi, maosh tarixi, team_links, ishdan ketish.
 *
 * Bazada 2025-dekabr davri CLOSED qilib qo'yiladi: 2025-12-31 gacha bo'lgan
 * kunlarga ta'sir qiladigan o'zgarish — 409 PERIOD_CLOSED. Qolgan testlar 2026 sanalari bilan.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, createUser, ensureRoles, tokenFor, uniqueName, useTestEnv } from './app-helpers';

let app: INestApplication;
let prisma: PrismaService;
let calc: string;
let approver: string;
let dept: { id: string; code: string };
let salesRep: { id: string; code: string };
let supervisor: { id: string; code: string };
let inactiveDept: { id: string; code: string };

beforeAll(async () => {
  useTestEnv();
  app = await createTestApp();
  prisma = app.get(PrismaService);
  await ensureRoles(prisma);
  calc = await tokenFor(app, (await createUser(prisma, { roles: ['CALCULATOR'] })).id);
  approver = await tokenFor(app, (await createUser(prisma, { roles: ['APPROVER'] })).id);

  const ref = async (model: 'department' | 'position', isActive = true) => {
    const code = uniqueName(model === 'department' ? 'DEP' : 'POS');
    const row = await (prisma[model] as typeof prisma.department).create({ data: { name: code, code, isActive } });
    return { id: row.id.toString(), code };
  };
  dept = await ref('department');
  inactiveDept = await ref('department', false);
  salesRep = await ref('position');
  supervisor = await ref('position');

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
    patch: (url: string, body: object) => request(server).patch(`/api${url}`).set(auth).send(body),
    delete: (url: string) => request(server).delete(`/api${url}`).set(auth),
  };
}

async function newEmployee(extra: object = {}): Promise<string> {
  const code = uniqueName('E');
  await http(calc).post('/employees', { employeeCode: code, firstName: 'Ali', lastName: 'Valiyev', ...extra }).expect(201);
  return code;
}

type Period = { startDate: string; endDate: string | null };
const periods = (items: Period[]) => items.map((item) => [item.startDate, item.endDate]);

// ---------------------------------------------------------------------------

describe('Xodimlar — /employees', () => {
  it('CALCULATOR yaratadi; kod band bo\'lsa 409 CODE_TAKEN; APPROVER yarata olmaydi', async () => {
    const code = uniqueName('E');
    const res = await http(calc)
      .post('/employees', { employeeCode: code, firstName: 'Bobur', lastName: 'Karimov', hireDate: '2026-01-10' })
      .expect(201);
    expect(res.body).toMatchObject({
      employeeCode: code,
      firstName: 'Bobur',
      lastName: 'Karimov',
      middleName: null,
      hireDate: '2026-01-10',
      terminationDate: null,
      isActive: true,
      assignment: null,
      salary: null,
    });
    expect((await http(calc).post('/employees', { employeeCode: code }).expect(409)).body.code).toBe('CODE_TAKEN');
    await http(approver).post('/employees', { employeeCode: uniqueName('E') }).expect(403);

    const audit = await prisma.auditLog.findFirst({ where: { action: 'EMPLOYEE_CREATE', entityId: BigInt(res.body.id) } });
    expect(audit?.newData).toMatchObject({ employeeCode: code, firstName: 'Bobur' });
  });

  it('URL\'da biznes kodi; topilmasa 404 EMPLOYEE_NOT_FOUND', async () => {
    const code = await newEmployee();
    expect((await http(approver).get(`/employees/${code}`).expect(200)).body.employeeCode).toBe(code);
    expect((await http(approver).get('/employees/YOQ_KOD').expect(404)).body.code).toBe('EMPLOYEE_NOT_FOUND');
  });

  it('PATCH: ism va sana; ishga kirgan sanadan oldin ketish — 400 INVALID_DATE_RANGE', async () => {
    const code = await newEmployee({ hireDate: '2026-02-01' });
    const res = await http(calc).patch(`/employees/${code}`, { middleName: 'Aliyevich' }).expect(200);
    expect(res.body.middleName).toBe('Aliyevich');
    const bad = await http(calc).patch(`/employees/${code}`, { terminationDate: '2026-01-15' }).expect(400);
    expect(bad.body.code).toBe('INVALID_DATE_RANGE');
    await http(calc).patch(`/employees/${code}`, { employeeCode: 'BOSHQA' }).expect(400);
  });
});

// ---------------------------------------------------------------------------

describe('Lavozim tarixi — /employees/:code/assignments', () => {
  it('yangi lavozim oldingisini bir kun oldin yopadi; xodim sanaga ko\'ra lavozimni ko\'rsatadi', async () => {
    const code = await newEmployee();
    const first = await http(calc)
      .post(`/employees/${code}/assignments`, { departmentId: dept.id, positionId: salesRep.id, startDate: '2026-01-01' })
      .expect(201);
    expect(first.body).toMatchObject({ departmentCode: dept.code, positionCode: salesRep.code, startDate: '2026-01-01', endDate: null });

    await http(calc)
      .post(`/employees/${code}/assignments`, { departmentId: dept.id, positionId: supervisor.id, startDate: '2026-04-01' })
      .expect(201);

    const list = await http(approver).get(`/employees/${code}/assignments`).expect(200);
    expect(periods(list.body)).toEqual([
      ['2026-01-01', '2026-03-31'],
      ['2026-04-01', null],
    ]);

    const inFeb = await http(approver).get(`/employees/${code}?date=2026-02-15`).expect(200);
    expect(inFeb.body.assignment.positionCode).toBe(salesRep.code);
    const inMay = await http(approver).get(`/employees?date=2026-05-01&positionId=${supervisor.id}&search=${code}`).expect(200);
    expect(inMay.body.items.map((item: { employeeCode: string }) => item.employeeCode)).toEqual([code]);

    const audit = await prisma.auditLog.findMany({
      where: { entityType: 'employee_assignments', entityId: BigInt(first.body.id) },
      orderBy: { id: 'asc' },
    });
    expect(audit.map((row) => row.action)).toEqual(['HISTORY_CREATE', 'HISTORY_UPDATE']);
    expect(audit[1].newData).toMatchObject({ endDate: '2026-03-31' });
  });

  it('qoidalar: oyning 1-kuni, bir xil qiymat, tartib, nofaol bo\'lim, yopilgan davr', async () => {
    const code = await newEmployee();
    const url = `/employees/${code}/assignments`;
    await http(calc).post(url, { departmentId: dept.id, positionId: salesRep.id, startDate: '2026-01-01' }).expect(201);

    const cases: [object, number, string][] = [
      [{ departmentId: dept.id, positionId: supervisor.id, startDate: '2026-03-15' }, 400, 'START_NOT_MONTH_START'],
      [{ departmentId: dept.id, positionId: salesRep.id, startDate: '2026-03-01' }, 409, 'NO_CHANGE'],
      [{ departmentId: dept.id, positionId: supervisor.id, startDate: '2026-01-01' }, 409, 'HISTORY_ORDER'],
      [{ departmentId: inactiveDept.id, positionId: supervisor.id, startDate: '2026-03-01' }, 409, 'REFERENCE_INACTIVE'],
      [{ departmentId: '999999999', positionId: supervisor.id, startDate: '2026-03-01' }, 404, 'REFERENCE_NOT_FOUND'],
    ];
    for (const [body, status, errorCode] of cases) {
      const res = await http(calc).post(url, body).expect(status);
      expect(res.body.code).toBe(errorCode);
    }

    const closed = await newEmployee();
    const res = await http(calc)
      .post(`/employees/${closed}/assignments`, { departmentId: dept.id, positionId: salesRep.id, startDate: '2025-12-01' })
      .expect(409);
    expect(res.body.code).toBe('PERIOD_CLOSED');
  });

  it('PATCH va DELETE faqat oxirgi yozuvga; DELETE oldingisini qayta ochadi', async () => {
    const code = await newEmployee();
    const url = `/employees/${code}/assignments`;
    const first = await http(calc).post(url, { departmentId: dept.id, positionId: salesRep.id, startDate: '2026-01-01' }).expect(201);
    const second = await http(calc).post(url, { departmentId: dept.id, positionId: supervisor.id, startDate: '2026-03-01' }).expect(201);

    expect((await http(calc).patch(`${url}/${first.body.id}`, { startDate: '2026-02-01' }).expect(409)).body.code).toBe('NOT_LAST_RECORD');
    expect((await http(calc).delete(`${url}/${first.body.id}`).expect(409)).body.code).toBe('NOT_LAST_RECORD');

    await http(calc).patch(`${url}/${second.body.id}`, { startDate: '2026-05-01' }).expect(200);
    expect(periods((await http(calc).get(url).expect(200)).body)).toEqual([
      ['2026-01-01', '2026-04-30'],
      ['2026-05-01', null],
    ]);
    await http(calc).patch(`${url}/${second.body.id}`, { startDate: '2026-02-01' }).expect(200);
    expect(periods((await http(calc).get(url).expect(200)).body)).toEqual([
      ['2026-01-01', '2026-01-31'],
      ['2026-02-01', null],
    ]);

    await http(calc).delete(`${url}/${second.body.id}`).expect(204);
    expect(periods((await http(calc).get(url).expect(200)).body)).toEqual([['2026-01-01', null]]);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'HISTORY_DELETE', entityId: BigInt(second.body.id) } });
    expect(audit?.oldData).toMatchObject({ startDate: '2026-02-01', positionCode: supervisor.code });

    // Boshqa xodimning yozuvi shu URL orqali topilmaydi.
    const other = await newEmployee();
    await http(calc).delete(`/employees/${other}/assignments/${first.body.id}`).expect(404);
  });
});

// ---------------------------------------------------------------------------

describe('Maosh tarixi — /employees/:code/salaries', () => {
  it('summa satr ko\'rinishida (Decimal), oldingisi yopiladi; manfiy summa — 400', async () => {
    const code = await newEmployee();
    const url = `/employees/${code}/salaries`;
    const first = await http(calc).post(url, { salaryAmount: '3000000', startDate: '2026-01-01' }).expect(201);
    expect(first.body).toMatchObject({ employeeCode: code, salaryAmount: '3000000.00', startDate: '2026-01-01', endDate: null });
    await http(calc).post(url, { salaryAmount: '3500000.50', startDate: '2026-06-01' }).expect(201);
    expect(periods((await http(calc).get(url).expect(200)).body)).toEqual([
      ['2026-01-01', '2026-05-31'],
      ['2026-06-01', null],
    ]);
    expect((await http(calc).get(`/employees/${code}?date=2026-07-01`).expect(200)).body.salary.salaryAmount).toBe('3500000.50');

    await http(calc).post(url, { salaryAmount: '-1', startDate: '2026-08-01' }).expect(400);
    await http(calc).post(url, { salaryAmount: 3000000, startDate: '2026-08-01' }).expect(400);
    expect((await http(calc).patch(`${url}/${first.body.id}`, { salaryAmount: '1' }).expect(409)).body.code).toBe('NOT_LAST_RECORD');
  });
});

// ---------------------------------------------------------------------------

describe('Jamoa havolalari — /team-links', () => {
  it('yangi rahbar istalgan kundan — eskisi bir kun oldin yopiladi; OPERATOR havolasi mustaqil', async () => {
    const [sup1, sup2, op, rep] = [await newEmployee(), await newEmployee(), await newEmployee(), await newEmployee()];
    const first = await http(calc)
      .post('/team-links', { leaderCode: sup1, memberCode: rep, linkType: 'SUPERVISOR', startDate: '2026-01-10' })
      .expect(201);
    expect(first.body).toMatchObject({ leaderCode: sup1, memberCode: rep, linkType: 'SUPERVISOR', endDate: null });
    await http(calc).post('/team-links', { leaderCode: op, memberCode: rep, linkType: 'OPERATOR', startDate: '2026-01-10' }).expect(201);
    await http(calc).post('/team-links', { leaderCode: sup2, memberCode: rep, linkType: 'SUPERVISOR', startDate: '2026-03-17' }).expect(201);

    const links = await http(approver).get(`/team-links?memberCode=${rep}&linkType=SUPERVISOR`).expect(200);
    expect(links.body.map((link: Period & { leaderCode: string }) => [link.leaderCode, link.startDate, link.endDate])).toEqual([
      [sup1, '2026-01-10', '2026-03-16'],
      [sup2, '2026-03-17', null],
    ]);
    const onDate = await http(approver).get(`/team-links?leaderCode=${sup1}&date=2026-02-01`).expect(200);
    expect(onDate.body).toHaveLength(1);
    expect((await http(approver).get(`/team-links?leaderCode=${sup1}&date=2026-04-01`).expect(200)).body).toHaveLength(0);
  });

  it('xatolar: o\'ziga o\'zi, noma\'lum xodim, bir xil rahbar, yopilgan davr', async () => {
    const [leader, member] = [await newEmployee(), await newEmployee()];
    const post = (body: object) => http(calc).post('/team-links', { linkType: 'SUPERVISOR', startDate: '2026-02-01', ...body });
    expect((await post({ leaderCode: member, memberCode: member }).expect(400)).body.code).toBe('VALIDATION_ERROR');
    expect((await post({ leaderCode: 'YOQ', memberCode: member }).expect(404)).body.code).toBe('EMPLOYEE_NOT_FOUND');
    await post({ leaderCode: leader, memberCode: member }).expect(201);
    expect((await post({ leaderCode: leader, memberCode: member, startDate: '2026-03-01' }).expect(409)).body.code).toBe('NO_CHANGE');
    const other = await newEmployee();
    expect((await post({ leaderCode: leader, memberCode: other, startDate: '2025-12-20' }).expect(409)).body.code).toBe('PERIOD_CLOSED');
  });

  it('PATCH (rahbarni almashtirish, tugash sanasi) va DELETE — oxirgi yozuvga', async () => {
    const [sup1, sup2, rep] = [await newEmployee(), await newEmployee(), await newEmployee()];
    const link = await http(calc)
      .post('/team-links', { leaderCode: sup1, memberCode: rep, linkType: 'SUPERVISOR', startDate: '2026-02-01' })
      .expect(201);
    const res = await http(calc).patch(`/team-links/${link.body.id}`, { leaderCode: sup2, endDate: '2026-12-31' }).expect(200);
    expect(res.body).toMatchObject({ leaderCode: sup2, endDate: '2026-12-31' });
    await http(calc).delete(`/team-links/${link.body.id}`).expect(204);
    expect((await http(calc).get(`/team-links?memberCode=${rep}`).expect(200)).body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('Ishdan ketish — PATCH /employees/:code { terminationDate }', () => {
  it('ochiq lavozim, maosh va team_links (a\'zo va rahbar sifatida) shu sanada yopiladi, isActive=false', async () => {
    const [leader, emp, member] = [await newEmployee(), await newEmployee(), await newEmployee()];
    await http(calc)
      .post(`/employees/${emp}/assignments`, { departmentId: dept.id, positionId: supervisor.id, startDate: '2026-01-01' })
      .expect(201);
    await http(calc).post(`/employees/${emp}/salaries`, { salaryAmount: '5000000', startDate: '2026-01-01' }).expect(201);
    await http(calc).post('/team-links', { leaderCode: leader, memberCode: emp, linkType: 'OPERATOR', startDate: '2026-01-05' }).expect(201);
    await http(calc).post('/team-links', { leaderCode: emp, memberCode: member, linkType: 'SUPERVISOR', startDate: '2026-01-05' }).expect(201);

    const res = await http(calc).patch(`/employees/${emp}`, { terminationDate: '2026-06-15' }).expect(200);
    expect(res.body).toMatchObject({ terminationDate: '2026-06-15', isActive: false });

    expect(periods((await http(calc).get(`/employees/${emp}/assignments`)).body)).toEqual([['2026-01-01', '2026-06-15']]);
    expect(periods((await http(calc).get(`/employees/${emp}/salaries`)).body)).toEqual([['2026-01-01', '2026-06-15']]);
    expect(periods((await http(calc).get(`/team-links?memberCode=${emp}`)).body)).toEqual([['2026-01-05', '2026-06-15']]);
    expect(periods((await http(calc).get(`/team-links?leaderCode=${emp}`)).body)).toEqual([['2026-01-05', '2026-06-15']]);

    const employeeId = BigInt(res.body.id);
    const audit = await prisma.auditLog.findFirst({ where: { action: 'EMPLOYEE_UPDATE', entityId: employeeId }, orderBy: { id: 'desc' } });
    expect(audit?.oldData).toMatchObject({ isActive: true, terminationDate: null });
    expect(audit?.newData).toMatchObject({ isActive: false, terminationDate: '2026-06-15' });
    // Yopilgan har bir tarixiy yozuv auditda: eski end_date = null, yangisi — ishdan ketish sanasi.
    const closed = [
      ['employee_assignments', (await http(calc).get(`/employees/${emp}/assignments`)).body[0].id],
      ['employee_salary_history', (await http(calc).get(`/employees/${emp}/salaries`)).body[0].id],
      ['team_links', (await http(calc).get(`/team-links?memberCode=${emp}`)).body[0].id],
      ['team_links', (await http(calc).get(`/team-links?leaderCode=${emp}`)).body[0].id],
    ];
    for (const [entityType, id] of closed) {
      const row = await prisma.auditLog.findFirst({ where: { action: 'HISTORY_UPDATE', entityType, entityId: BigInt(id) } });
      expect(row?.oldData).toMatchObject({ endDate: null });
      expect(row?.newData).toMatchObject({ endDate: '2026-06-15' });
    }
  });

  it('ishdan ketgandan keyin boshlangan yozuv bo\'lsa — 409 HISTORY_ORDER va hech narsa o\'zgarmaydi', async () => {
    const emp = await newEmployee();
    await http(calc).post(`/employees/${emp}/salaries`, { salaryAmount: '1000', startDate: '2026-01-01' }).expect(201);
    await http(calc).post(`/employees/${emp}/salaries`, { salaryAmount: '2000', startDate: '2026-07-01' }).expect(201);
    const res = await http(calc).patch(`/employees/${emp}`, { terminationDate: '2026-03-10' }).expect(409);
    expect(res.body.code).toBe('HISTORY_ORDER');
    const after = await http(calc).get(`/employees/${emp}`).expect(200);
    expect(after.body).toMatchObject({ terminationDate: null, isActive: true });
    expect(periods((await http(calc).get(`/employees/${emp}/salaries`)).body)).toEqual([
      ['2026-01-01', '2026-06-30'],
      ['2026-07-01', null],
    ]);
  });

  it('terminationDate bilan birga isActive=true — 400', async () => {
    const emp = await newEmployee();
    await http(calc).patch(`/employees/${emp}`, { terminationDate: '2026-06-15', isActive: true }).expect(400);
  });
});
