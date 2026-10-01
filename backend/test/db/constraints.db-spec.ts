/**
 * Migratsiyadagi qo'lda SQL cheklovlari (docs/ERD_v2.dbml) haqiqatan ishlashini tekshiradi.
 * Har bir holatda: noto'g'ri qiymat aynan kutilgan cheklov bilan rad etiladi,
 * to'g'ri chegara holati esa o'tadi.
 */
import {
  expectOk,
  expectViolation,
  insertDepartment,
  insertEmployee,
  insertKpi,
  insertPayroll,
  insertPeriod,
  insertPosition,
  insertUser,
  useRollbackClient,
} from './db-helpers';

const db = useRollbackClient();

describe('import_batches', () => {
  const insertBatch = `INSERT INTO import_batches
    (period_id, file_name, file_hash, import_type, version_number, status, imported_by)
    VALUES ($1, 'f.xlsx', $2, $3, $4, $5, $6)`;

  let userId: string;
  let periodId: string;
  beforeEach(async () => {
    userId = await insertUser(db(), 'importer');
    periodId = await insertPeriod(db(), 2026, 1);
  });

  it('bitta (davr, tur) da ikkinchi ACTIVE versiya rad etiladi, ARCHIVED esa o\'tadi', async () => {
    await expectOk(db(), insertBatch, [periodId, 'h1', 'SALES', 1, 'ACTIVE', userId]);
    await expectViolation(db(), insertBatch, [periodId, 'h2', 'SALES', 2, 'ACTIVE', userId], 'import_batches_one_active_key');
    await expectOk(db(), insertBatch, [periodId, 'h2', 'SALES', 2, 'ARCHIVED', userId]);
    // Boshqa turdagi ACTIVE — mustaqil
    await expectOk(db(), insertBatch, [periodId, 'h1', 'PLANS', 1, 'ACTIVE', userId]);
  });

  it('davrsiz (period_id NULL) ma\'lumotnoma importida ham bitta ACTIVE — NULLS NOT DISTINCT', async () => {
    await expectOk(db(), insertBatch, [null, 'h1', 'EMPLOYEES', 1, 'ACTIVE', userId]);
    await expectViolation(db(), insertBatch, [null, 'h2', 'EMPLOYEES', 2, 'ACTIVE', userId], 'import_batches_one_active_key');
  });

  it('versiya raqami takrorlanmaydi, period_id NULL bo\'lsa ham', async () => {
    await expectOk(db(), insertBatch, [null, 'h1', 'PRODUCTS', 1, 'ARCHIVED', userId]);
    await expectViolation(db(), insertBatch, [null, 'h2', 'PRODUCTS', 1, 'ARCHIVED', userId], 'import_batches_version_key');
  });

  it('bir xil fayl (file_hash) qayta yuklanmaydi', async () => {
    await expectOk(db(), insertBatch, [periodId, 'same', 'SALES', 1, 'INVALID', userId]);
    await expectViolation(db(), insertBatch, [periodId, 'same', 'SALES', 2, 'ACTIVE', userId], 'import_batches_file_hash_key');
    await expectOk(db(), insertBatch, [null, 'same', 'CLIENTS', 1, 'ACTIVE', userId]);
    await expectViolation(db(), insertBatch, [null, 'same', 'CLIENTS', 2, 'ARCHIVED', userId], 'import_batches_file_hash_key');
  });

  it('SALES va PLANS davrsiz bo\'lmaydi', async () => {
    await expectViolation(db(), insertBatch, [null, 'h', 'SALES', 1, 'ACTIVE', userId], 'import_batches_period_required_check');
    await expectViolation(db(), insertBatch, [null, 'h', 'PLANS', 1, 'ACTIVE', userId], 'import_batches_period_required_check');
  });

  it('noto\'g\'ri status va tur rad etiladi', async () => {
    await expectViolation(db(), insertBatch, [periodId, 'h', 'SALES', 1, 'DRAFT', userId], 'import_batches_status_check');
    await expectViolation(db(), insertBatch, [periodId, 'h', 'BONUS', 1, 'ACTIVE', userId], 'import_batches_import_type_check');
  });
});

describe('tarixiy jadvallar: sanalar va ustma-ust tushish (EXCLUDE)', () => {
  let employeeId: string;
  let positionId: string;
  let departmentId: string;
  beforeEach(async () => {
    employeeId = await insertEmployee(db(), 'E1');
    positionId = await insertPosition(db(), 'P1');
    departmentId = await insertDepartment(db(), 'D1');
  });

  const insertAssignment = `INSERT INTO employee_assignments
    (employee_id, department_id, position_id, start_date, end_date) VALUES ($1, $2, $3, $4, $5)`;

  it('employee_assignments: ketma-ket oraliqlar o\'tadi, ustma-ust tushganlar rad etiladi', async () => {
    await expectOk(db(), insertAssignment, [employeeId, departmentId, positionId, '2026-01-01', '2026-01-31']);
    await expectOk(db(), insertAssignment, [employeeId, departmentId, positionId, '2026-02-01', null]);
    // end_date = NULL → cheksiz; keyingi har qanday sana ustma-ust tushadi
    await expectViolation(db(), insertAssignment, [employeeId, departmentId, positionId, '2027-05-01', null], 'employee_assignments_no_overlap');
    // Chegaraviy kun ham kiradi ('[]')
    await expectViolation(db(), insertAssignment, [employeeId, departmentId, positionId, '2025-12-01', '2026-01-01'], 'employee_assignments_no_overlap');
  });

  it('end_date < start_date rad etiladi', async () => {
    await expectViolation(db(), insertAssignment, [employeeId, departmentId, positionId, '2026-02-01', '2026-01-31'], 'employee_assignments_dates_check');
  });

  it('employee_salary_history: ustma-ust tushish va manfiy oylik rad etiladi', async () => {
    const sql = `INSERT INTO employee_salary_history (employee_id, salary_amount, start_date, end_date)
      VALUES ($1, $2, $3, $4)`;
    await expectOk(db(), sql, [employeeId, '3000000', '2026-01-01', null]);
    await expectViolation(db(), sql, [employeeId, '3500000', '2026-06-01', null], 'employee_salary_history_no_overlap');
    const other = await insertEmployee(db(), 'E2');
    await expectViolation(db(), sql, [other, '-1', '2026-01-01', null], 'employee_salary_history_salary_amount_check');
  });

  it('team_links: bir vaqtda bitta SUPERVISOR va bitta OPERATOR, o\'ziga havola yo\'q', async () => {
    const sup1 = await insertEmployee(db(), 'SUP1');
    const sup2 = await insertEmployee(db(), 'SUP2');
    const op = await insertEmployee(db(), 'OP1');
    const sql = `INSERT INTO team_links (leader_id, member_id, link_type, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5)`;
    await expectOk(db(), sql, [sup1, employeeId, 'SUPERVISOR', '2026-01-01', null]);
    await expectOk(db(), sql, [op, employeeId, 'OPERATOR', '2026-01-01', null]);
    await expectViolation(db(), sql, [sup2, employeeId, 'SUPERVISOR', '2026-03-01', null], 'team_links_no_overlap');
    await expectViolation(db(), sql, [employeeId, employeeId, 'SUPERVISOR', '2030-01-01', null], 'team_links_not_self_check');
    await expectViolation(db(), sql, [sup2, op, 'MANAGER', '2026-01-01', null], 'team_links_link_type_check');
  });

  it('position_kpis va employee_kpi_overrides: ustma-ust tushish rad etiladi', async () => {
    const kpiId = await insertKpi(db(), 'K1');
    const pk = 'INSERT INTO position_kpis (position_id, kpi_id, start_date, end_date) VALUES ($1, $2, $3, $4)';
    await expectOk(db(), pk, [positionId, kpiId, '2026-01-01', '2026-06-30']);
    await expectViolation(db(), pk, [positionId, kpiId, '2026-06-30', null], 'position_kpis_no_overlap');
    await expectOk(db(), pk, [positionId, kpiId, '2026-07-01', null]);

    const ov = `INSERT INTO employee_kpi_overrides (employee_id, kpi_id, action, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5)`;
    await expectOk(db(), ov, [employeeId, kpiId, 'ADD', '2026-01-01', null]);
    await expectViolation(db(), ov, [employeeId, kpiId, 'REMOVE', '2026-02-01', null], 'employee_kpi_overrides_no_overlap');
    await expectViolation(db(), ov, [employeeId, kpiId, 'REPLACE', '2020-01-01', '2020-12-31'], 'employee_kpi_overrides_action_check');
  });
});

describe('audit_logs — faqat INSERT', () => {
  it('INSERT o\'tadi; UPDATE, DELETE, TRUNCATE trigger bilan to\'siladi', async () => {
    await expectOk(db(), "INSERT INTO audit_logs (action, entity_type, entity_id) VALUES ('CREATE', 'employees', 1)");
    const blocked = { code: '42501' };
    await expectViolation(db(), "UPDATE audit_logs SET action = 'HACK'", [], blocked);
    await expectViolation(db(), 'DELETE FROM audit_logs', [], blocked);
    await expectViolation(db(), 'TRUNCATE audit_logs', [], blocked);
    const { rows } = await db().query<{ action: string }>('SELECT action FROM audit_logs');
    expect(rows).toEqual([{ action: 'CREATE' }]);
  });
});

describe('payroll_periods', () => {
  const sql = 'INSERT INTO payroll_periods (year, month, status, updated_at) VALUES ($1, $2, $3, now())';

  it('oy 1..12, status faqat OPEN/REVIEW/CLOSED', async () => {
    await expectViolation(db(), sql, [2026, 13, 'OPEN'], 'payroll_periods_month_check');
    await expectViolation(db(), sql, [2026, 0, 'OPEN'], 'payroll_periods_month_check');
    await expectViolation(db(), sql, [2026, 1, 'DRAFT'], 'payroll_periods_status_check');
    await expectOk(db(), sql, [2026, 12, 'REVIEW']);
  });

  it('ikki kishi qoidasi: yuborgan odam o\'zi yopa olmaydi', async () => {
    const calculator = await insertUser(db(), 'calc');
    const approver = await insertUser(db(), 'appr');
    const periodId = await insertPeriod(db(), 2026, 3);
    await db().query("UPDATE payroll_periods SET status = 'REVIEW', submitted_by = $1 WHERE id = $2", [calculator, periodId]);
    await expectViolation(
      db(),
      "UPDATE payroll_periods SET status = 'CLOSED', closed_by = $1 WHERE id = $2",
      [calculator, periodId],
      'payroll_periods_two_person_check',
    );
    await expectOk(db(), "UPDATE payroll_periods SET status = 'CLOSED', closed_by = $1 WHERE id = $2", [approver, periodId]);
  });
});

describe('KPI konfiguratsiyasi', () => {
  const kpiSql = `INSERT INTO kpi_definitions
    (name, code, unit_id, calculation_type, aggregation, scope, team_link_type, fact_source, updated_at)
    VALUES ($1, $1, $2, $3, $4, $5, $6, $7, now())`;
  let unitId: string;
  beforeEach(async () => {
    const { rows } = await db().query<{ id: string }>("INSERT INTO kpi_units (name, code) VALUES ('So''m', 'UZS') RETURNING id");
    unitId = rows[0].id;
  });

  it('TEAM scope uchun team_link_type majburiy, OWN uchun bo\'lmasligi kerak', async () => {
    await expectViolation(db(), kpiSql, ['A', unitId, 'STEP', 'SUM', 'TEAM', null, 'EXCEL'], 'kpi_definitions_team_scope_check');
    await expectViolation(db(), kpiSql, ['B', unitId, 'STEP', 'SUM', 'OWN', 'SUPERVISOR', 'EXCEL'], 'kpi_definitions_team_scope_check');
    await expectOk(db(), kpiSql, ['C', unitId, 'STEP', 'SUM', 'TEAM', 'OPERATOR', 'EXCEL']);
  });

  it('noto\'g\'ri hisoblash turi, aggregation, fact_source rad etiladi; COUNT_DISTINCT_POSITIVE o\'tadi', async () => {
    await expectViolation(db(), kpiSql, ['D', unitId, 'BONUS', 'SUM', 'OWN', null, 'EXCEL'], 'kpi_definitions_calculation_type_check');
    await expectViolation(db(), kpiSql, ['E', unitId, 'STEP', 'AVG', 'OWN', null, 'EXCEL'], 'kpi_definitions_aggregation_check');
    await expectViolation(db(), kpiSql, ['F', unitId, 'STEP', 'SUM', 'OWN', null, 'API'], 'kpi_definitions_fact_source_check');
    await expectOk(db(), kpiSql, ['G', unitId, 'RESULT_PERCENTAGE', 'COUNT_DISTINCT_POSITIVE', 'OWN', null, 'EXCEL']);
  });

  it('bitta KPI ichida priority takrorlanmaydi; pog\'ona va filtr cheklovlari', async () => {
    const kpiId = await insertKpi(db(), 'K2');
    const ruleSql = 'INSERT INTO kpi_rules (kpi_id, name, priority, updated_at) VALUES ($1, $2, $3, now()) RETURNING id';
    const { rows } = await db().query<{ id: string }>(ruleSql, [kpiId, 'R1', 1]);
    await expectViolation(db(), ruleSql, [kpiId, 'R2', 1], 'kpi_rules_kpi_id_priority_key');

    const stepSql = `INSERT INTO kpi_rule_steps (kpi_rule_id, min_percent, max_percent, coefficient)
      VALUES ($1, $2, $3, $4)`;
    await expectViolation(db(), stepSql, [rows[0].id, 80, 80, 1], 'kpi_rule_steps_percent_range_check');
    await expectViolation(db(), stepSql, [rows[0].id, 70, 80, -1], 'kpi_rule_steps_coefficient_check');
    await expectOk(db(), stepSql, [rows[0].id, 100, null, 1]);

    const filterSql = 'INSERT INTO kpi_rule_filters (kpi_rule_id, field_name, operator, values) VALUES ($1, $2, $3, $4)';
    await expectViolation(db(), filterSql, [rows[0].id, 'product_id', 'LIKE', '["1"]'], 'kpi_rule_filters_operator_check');
    await expectOk(db(), filterSql, [rows[0].id, 'product_id', 'NOT_IN', '["1","2"]']);
  });

  it('kpi_plans: plan_value > 0', async () => {
    const employeeId = await insertEmployee(db(), 'E1');
    const periodId = await insertPeriod(db(), 2026, 1);
    const kpiId = await insertKpi(db(), 'K3');
    const sql = 'INSERT INTO kpi_plans (period_id, employee_id, kpi_id, plan_value, updated_at) VALUES ($1, $2, $3, $4, now())';
    await expectViolation(db(), sql, [periodId, employeeId, kpiId, 0], 'kpi_plans_plan_value_check');
    await expectOk(db(), sql, [periodId, employeeId, kpiId, null]);
  });
});

describe('pul summalari', () => {
  let employeeId: string;
  let periodId: string;
  let userId: string;
  beforeEach(async () => {
    employeeId = await insertEmployee(db(), 'E1');
    periodId = await insertPeriod(db(), 2026, 1);
    userId = await insertUser(db(), 'u');
  });

  it.each(['bonuses', 'penalties'])('%s: manfiy summa rad etiladi', async (table) => {
    const sql = `INSERT INTO ${table} (employee_id, period_id, name, amount) VALUES ($1, $2, 'x', $3)`;
    await expectViolation(db(), sql, [employeeId, periodId, '-1'], `${table}_amount_check`);
    await expectOk(db(), sql, [employeeId, periodId, '0']);
  });

  it('advances: manfiy summa rad etiladi', async () => {
    const sql = 'INSERT INTO advances (employee_id, period_id, amount) VALUES ($1, $2, $3)';
    await expectViolation(db(), sql, [employeeId, periodId, '-500'], 'advances_amount_check');
  });

  it('sales_lines: qaytarish uchun manfiy summa va dona ruxsat etiladi', async () => {
    const batch = await db().query<{ id: string }>(
      `INSERT INTO import_batches (period_id, file_name, file_hash, import_type, version_number, status, imported_by)
       VALUES ($1, 'f', 'h', 'SALES', 1, 'ACTIVE', $2) RETURNING id`,
      [periodId, userId],
    );
    const row = await db().query<{ id: string }>(
      'INSERT INTO import_rows (batch_id, row_number) VALUES ($1, 1) RETURNING id',
      [batch.rows[0].id],
    );
    const group = await db().query<{ id: string }>("INSERT INTO product_groups (name, updated_at) VALUES ('G', now()) RETURNING id");
    const product = await db().query<{ id: string }>(
      "INSERT INTO products (name, code, product_group_id, updated_at) VALUES ('P', 'P', $1, now()) RETURNING id",
      [group.rows[0].id],
    );
    const client = await db().query<{ id: string }>("INSERT INTO clients (name, code, updated_at) VALUES ('C', 'C', now()) RETURNING id");
    const priceType = await db().query<{ id: string }>("INSERT INTO price_types (name, code) VALUES ('Ulgurji', 'ULGURJI') RETURNING id");
    await expectOk(
      db(),
      `INSERT INTO sales_lines (import_batch_id, import_row_id, employee_id, product_id, client_id, price_type_id,
         sale_date, original_sale_date, quantity, amount)
       VALUES ($1, $2, $3, $4, $5, $6, '2026-01-15', '2025-12-20', -3, -150000)`,
      [batch.rows[0].id, row.rows[0].id, employeeId, product.rows[0].id, client.rows[0].id, priceType.rows[0].id],
    );
  });

  it('payrolls: net manfiy bo\'lishi mumkin, payable va komponentlar — yo\'q', async () => {
    const other = await insertEmployee(db(), 'E2');
    const sql = `INSERT INTO payrolls (period_id, employee_id, penalty_total, recalculation_amount,
        gross_amount, net_amount, payable_amount, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, now())`;
    await expectOk(db(), sql, [periodId, employeeId, '0', '-200000', '100000', '-100000', '0']);
    await expectViolation(db(), sql, [periodId, other, '0', '0', '0', '-1', '-1'], 'payrolls_payable_amount_check');
    await expectViolation(db(), sql, [periodId, other, '-1', '0', '0', '0', '0'], 'payrolls_non_negative_check');
  });

  it('payroll_items: DEBT_CARRYOVER ruxsat etiladi, noma\'lum tur — yo\'q', async () => {
    const payrollId = await insertPayroll(db(), periodId, employeeId);
    const sql = 'INSERT INTO payroll_items (payroll_id, item_type, amount) VALUES ($1, $2, $3)';
    await expectOk(db(), sql, [payrollId, 'DEBT_CARRYOVER', '100000']);
    await expectViolation(db(), sql, [payrollId, 'TIP', '1'], 'payroll_items_item_type_check');
  });

  it('payroll_payments: faqat CARD/CASH, summa >= 0, har usul bir marta', async () => {
    const payrollId = await insertPayroll(db(), periodId, employeeId);
    const sql = 'INSERT INTO payroll_payments (payroll_id, method, amount) VALUES ($1, $2, $3)';
    await expectOk(db(), sql, [payrollId, 'CARD', '100']);
    await expectViolation(db(), sql, [payrollId, 'CARD', '50'], 'payroll_payments_payroll_id_method_key');
    await expectViolation(db(), sql, [payrollId, 'CRYPTO', '50'], 'payroll_payments_method_check');
    await expectViolation(db(), sql, [payrollId, 'CASH', '-1'], 'payroll_payments_amount_check');
  });

  it('deposits: foiz 0..100; deposit_withdrawals: summa > 0, payout_type tekshiriladi', async () => {
    await expectViolation(
      db(),
      `INSERT INTO deposits (employee_id, period_id, base_amount, deposit_percent, deposit_amount)
       VALUES ($1, $2, 1000, 101, 0)`,
      [employeeId, periodId],
      'deposits_deposit_percent_check',
    );
    const sql = `INSERT INTO deposit_withdrawals (employee_id, period_id, amount, reason, payout_type, created_by)
      VALUES ($1, $2, $3, 'sabab', $4, $5)`;
    await expectViolation(db(), sql, [employeeId, periodId, '0', 'PAYROLL', userId], 'deposit_withdrawals_amount_check');
    await expectViolation(db(), sql, [employeeId, periodId, '10', 'BANK', userId], 'deposit_withdrawals_payout_type_check');
    await expectOk(db(), sql, [employeeId, periodId, '10', 'SEPARATE', userId]);
  });

  it('positions: deposit_percent 0..100', async () => {
    await expectViolation(
      db(),
      "INSERT INTO positions (name, deposit_percent, updated_at) VALUES ('X', 150, now())",
      [],
      'positions_deposit_percent_check',
    );
  });

  it('recalculations va employee_debts: manba va maqsad davr har xil', async () => {
    const next = await insertPeriod(db(), 2026, 2);
    const recalc = `INSERT INTO recalculations (employee_id, source_period_id, target_period_id, amount, reason, created_by)
      VALUES ($1, $2, $3, $4, 'tuzatish', $5)`;
    await expectViolation(db(), recalc, [employeeId, periodId, periodId, '100', userId], 'recalculations_periods_check');
    await expectOk(db(), recalc, [employeeId, periodId, next, '-250000', userId]);

    const debt = `INSERT INTO employee_debts (employee_id, source_period_id, target_period_id, amount, status)
      VALUES ($1, $2, $3, $4, $5)`;
    await expectViolation(db(), debt, [employeeId, periodId, periodId, '100', 'PENDING'], 'employee_debts_periods_check');
    await expectViolation(db(), debt, [employeeId, periodId, next, '0', 'PENDING'], 'employee_debts_amount_check');
    await expectViolation(db(), debt, [employeeId, periodId, next, '100', 'PAID'], 'employee_debts_status_check');
    await expectOk(db(), debt, [employeeId, periodId, next, '100', 'PENDING']);
  });

  it('kpi_results: kpi_amount >= 0', async () => {
    const kpiId = await insertKpi(db(), 'K4');
    await expectViolation(
      db(),
      'INSERT INTO kpi_results (period_id, employee_id, kpi_id, kpi_amount) VALUES ($1, $2, $3, -1)',
      [periodId, employeeId, kpiId],
      'kpi_results_kpi_amount_check',
    );
  });
});
