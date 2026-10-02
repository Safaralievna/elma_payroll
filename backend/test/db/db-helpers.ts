import 'dotenv/config';
import { Client, DatabaseError } from 'pg';

export function testDatabaseUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error("TEST_DATABASE_URL o'rnatilmagan (backend/.env ga qarang)");
  }
  const mainUrl = process.env.DATABASE_URL;
  if (mainUrl && new URL(mainUrl).pathname === new URL(testUrl).pathname) {
    throw new Error('TEST_DATABASE_URL asosiy baza bilan bir xil — testlar uni o\'chirib yuborardi');
  }
  return testUrl;
}

/**
 * E2E testlar (HTTP orqali, haqiqiy commit bilan) uchun alohida baza: ular yozgan
 * ma'lumot (masalan, o'chirib bo'lmaydigan audit_logs) rollback testlariga ta'sir qilmasin.
 */
export function e2eDatabaseUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.pathname = `${url.pathname}_e2e`;
  return url.toString();
}

/**
 * Har bir test tranzaksiya ichida ishlaydi va oxirida ROLLBACK qilinadi —
 * baza toza qoladi (audit_logs ni TRUNCATE qilib bo'lmaydi, shuning uchun shunday).
 */
export function useRollbackClient(): () => Client {
  let client: Client;
  beforeAll(async () => {
    client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
  });
  afterAll(async () => {
    await client.end();
  });
  beforeEach(async () => {
    await client.query('BEGIN');
  });
  afterEach(async () => {
    await client.query('ROLLBACK');
  });
  return () => client;
}

/** So'rov muvaffaqiyatli o'tadi (savepoint ichida, xato bo'lsa tranzaksiya buzilmaydi). */
export async function expectOk(client: Client, sql: string, params: unknown[] = []): Promise<void> {
  await client.query('SAVEPOINT expect_ok');
  try {
    await client.query(sql, params);
    await client.query('RELEASE SAVEPOINT expect_ok');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expect_ok');
    throw error;
  }
}

/**
 * So'rov aynan `constraint` nomli cheklov bilan rad etilishini tekshiradi.
 * Trigger xatolari uchun `constraint` o'rniga `{ code }` beriladi.
 */
export async function expectViolation(
  client: Client,
  sql: string,
  params: unknown[],
  expected: string | { code: string },
): Promise<void> {
  await client.query('SAVEPOINT expect_violation');
  let caught: unknown = null;
  try {
    await client.query(sql, params);
  } catch (error) {
    caught = error;
  }
  await client.query('ROLLBACK TO SAVEPOINT expect_violation');

  if (!(caught instanceof DatabaseError)) {
    throw new Error(`Kutilgan cheklov ishlamadi: ${JSON.stringify(expected)}\nSQL: ${sql}`);
  }
  if (typeof expected === 'string') {
    expect(caught.constraint).toBe(expected);
  } else {
    expect(caught.code).toBe(expected.code);
  }
}

// ---------- Fixture'lar (faqat shu tranzaksiya ichida yashaydi) ----------

async function insertId(client: Client, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await client.query<{ id: string }>(`${sql} RETURNING id`, params);
  return rows[0].id;
}

export function insertEmployee(client: Client, code: string): Promise<string> {
  return insertId(client, 'INSERT INTO employees (employee_id, updated_at) VALUES ($1, now())', [code]);
}

export function insertUser(client: Client, username: string): Promise<string> {
  return insertId(
    client,
    "INSERT INTO users (username, password_hash, updated_at) VALUES ($1, 'x', now())",
    [username],
  );
}

export function insertPeriod(client: Client, year: number, month: number): Promise<string> {
  return insertId(client, 'INSERT INTO payroll_periods (year, month, updated_at) VALUES ($1, $2, now())', [
    year,
    month,
  ]);
}

export function insertPosition(client: Client, code: string): Promise<string> {
  return insertId(client, 'INSERT INTO positions (name, code, updated_at) VALUES ($1, $1, now())', [code]);
}

export function insertDepartment(client: Client, code: string): Promise<string> {
  return insertId(client, 'INSERT INTO departments (name, code, updated_at) VALUES ($1, $1, now())', [code]);
}

export async function insertKpi(client: Client, code: string): Promise<string> {
  const unitId = await insertId(client, 'INSERT INTO kpi_units (name, code) VALUES ($1, $1)', [`U_${code}`]);
  return insertId(
    client,
    `INSERT INTO kpi_definitions (name, code, unit_id, calculation_type, fact_source, updated_at)
     VALUES ($1, $1, $2, 'STEP', 'EXCEL', now())`,
    [code, unitId],
  );
}

export async function insertPayroll(client: Client, periodId: string, employeeId: string): Promise<string> {
  return insertId(
    client,
    `INSERT INTO payrolls (period_id, employee_id, gross_amount, net_amount, payable_amount, updated_at)
     VALUES ($1, $2, 0, 0, 0, now())`,
    [periodId, employeeId],
  );
}
