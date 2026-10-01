-- ======================================================
-- Qo'lda SQL: Prisma sxemasida yozib bo'lmaydigan cheklovlar.
-- Manba: docs/ERD_v2.dbml dagi "// CHECK:", "EXCLUDE USING gist" va qo'lda indeks izohlari.
-- ======================================================

-- EXCLUDE'da "employee_id WITH =" (bigint) ishlatish uchun kerak.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------
-- 1. ORGANIZATION
-- ------------------------------------------------------

ALTER TABLE positions
  ADD CONSTRAINT positions_deposit_percent_check
    CHECK (deposit_percent IS NULL OR deposit_percent BETWEEN 0 AND 100);

ALTER TABLE employee_assignments
  ADD CONSTRAINT employee_assignments_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT employee_assignments_no_overlap
    EXCLUDE USING gist (employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

ALTER TABLE employee_salary_history
  ADD CONSTRAINT employee_salary_history_salary_amount_check
    CHECK (salary_amount >= 0),
  ADD CONSTRAINT employee_salary_history_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT employee_salary_history_no_overlap
    EXCLUDE USING gist (employee_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

-- Bir xodimda bir vaqtda bitta SUPERVISOR va bitta OPERATOR havolasi.
ALTER TABLE team_links
  ADD CONSTRAINT team_links_link_type_check
    CHECK (link_type IN ('SUPERVISOR', 'OPERATOR')),
  ADD CONSTRAINT team_links_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT team_links_not_self_check
    CHECK (leader_id <> member_id),
  ADD CONSTRAINT team_links_no_overlap
    EXCLUDE USING gist (member_id WITH =, link_type WITH =, daterange(start_date, end_date, '[]') WITH &&);

-- ------------------------------------------------------
-- 3. KPI DEFINITIONS
-- ------------------------------------------------------

ALTER TABLE kpi_definitions
  ADD CONSTRAINT kpi_definitions_calculation_type_check
    CHECK (calculation_type IN ('STEP', 'LINEAR', 'RESULT_PERCENTAGE', 'PER_UNIT', 'FIXED', 'MANUAL')),
  ADD CONSTRAINT kpi_definitions_aggregation_check
    CHECK (aggregation IS NULL OR aggregation IN ('SUM', 'COUNT', 'COUNT_DISTINCT', 'COUNT_DISTINCT_POSITIVE')),
  ADD CONSTRAINT kpi_definitions_scope_check
    CHECK (scope IN ('OWN', 'TEAM')),
  ADD CONSTRAINT kpi_definitions_team_link_type_check
    CHECK (team_link_type IS NULL OR team_link_type IN ('SUPERVISOR', 'OPERATOR')),
  ADD CONSTRAINT kpi_definitions_team_scope_check
    CHECK ((scope = 'TEAM') = (team_link_type IS NOT NULL)),
  ADD CONSTRAINT kpi_definitions_fact_source_check
    CHECK (fact_source IN ('EXCEL', 'ERP', 'MANUAL'));

-- ------------------------------------------------------
-- 4. KPI RULES
-- ------------------------------------------------------

ALTER TABLE kpi_rule_steps
  ADD CONSTRAINT kpi_rule_steps_coefficient_check
    CHECK (coefficient >= 0),
  ADD CONSTRAINT kpi_rule_steps_percent_range_check
    CHECK (max_percent IS NULL OR max_percent > min_percent);

ALTER TABLE kpi_rule_filters
  ADD CONSTRAINT kpi_rule_filters_operator_check
    CHECK (operator IN ('=', '!=', 'IN', 'NOT_IN', '>', '>=', '<', '<='));

-- ------------------------------------------------------
-- 5. KPI ASSIGNMENT
-- ------------------------------------------------------

ALTER TABLE position_kpis
  ADD CONSTRAINT position_kpis_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT position_kpis_no_overlap
    EXCLUDE USING gist (position_id WITH =, kpi_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

ALTER TABLE employee_kpi_overrides
  ADD CONSTRAINT employee_kpi_overrides_action_check
    CHECK (action IN ('ADD', 'REMOVE')),
  ADD CONSTRAINT employee_kpi_overrides_dates_check
    CHECK (end_date IS NULL OR end_date >= start_date),
  ADD CONSTRAINT employee_kpi_overrides_no_overlap
    EXCLUDE USING gist (employee_id WITH =, kpi_id WITH =, daterange(start_date, end_date, '[]') WITH &&);

-- ------------------------------------------------------
-- 6. PAYROLL PERIOD
-- ------------------------------------------------------

-- Ikki kishi qoidasi: REVIEW'ga yuborgan odam davrni yopa olmaydi.
ALTER TABLE payroll_periods
  ADD CONSTRAINT payroll_periods_month_check
    CHECK (month BETWEEN 1 AND 12),
  ADD CONSTRAINT payroll_periods_status_check
    CHECK (status IN ('OPEN', 'REVIEW', 'CLOSED')),
  ADD CONSTRAINT payroll_periods_two_person_check
    CHECK (closed_by IS NULL OR submitted_by IS NULL OR closed_by <> submitted_by);

-- ------------------------------------------------------
-- 7. MONTHLY KPI PLAN
-- ------------------------------------------------------

ALTER TABLE kpi_plans
  ADD CONSTRAINT kpi_plans_plan_value_check
    CHECK (plan_value IS NULL OR plan_value > 0),
  ADD CONSTRAINT kpi_plans_base_amount_check
    CHECK (base_amount IS NULL OR base_amount >= 0),
  ADD CONSTRAINT kpi_plans_manual_amount_check
    CHECK (manual_amount IS NULL OR manual_amount >= 0);

-- ------------------------------------------------------
-- 9. EXCEL IMPORT
-- ------------------------------------------------------

ALTER TABLE import_batches
  ADD CONSTRAINT import_batches_period_required_check
    CHECK (import_type NOT IN ('SALES', 'PLANS') OR period_id IS NOT NULL),
  ADD CONSTRAINT import_batches_import_type_check
    CHECK (import_type IN ('SALES', 'PLANS', 'EMPLOYEES', 'TEAM_LINKS', 'PRODUCTS', 'CLIENTS')),
  ADD CONSTRAINT import_batches_status_check
    CHECK (status IN ('ACTIVE', 'ARCHIVED', 'INVALID', 'COMPARISON'));

-- NULLS NOT DISTINCT: period_id = NULL bo'lgan ma'lumotnoma importlari ham
-- bitta "davr" kabi hisoblanadi.
-- version_key va file_hash_key schema.prisma da ham e'lon qilingan (Prisma ularni
-- o'chirmasligi uchun), init ularni oddiy unique qilib yaratadi — bu yerda
-- NULLS NOT DISTINCT bilan qayta yaratiladi. Nomlar schema.prisma bilan bir xil.
DROP INDEX import_batches_version_key;
CREATE UNIQUE INDEX import_batches_version_key
  ON import_batches (period_id, import_type, version_number) NULLS NOT DISTINCT;

-- Bitta (davr, tur) da faqat bitta ACTIVE versiya.
CREATE UNIQUE INDEX import_batches_one_active_key
  ON import_batches (period_id, import_type) NULLS NOT DISTINCT
  WHERE status = 'ACTIVE';

-- "Bu fayl allaqachon yuklangan".
DROP INDEX import_batches_file_hash_key;
CREATE UNIQUE INDEX import_batches_file_hash_key
  ON import_batches (period_id, import_type, file_hash) NULLS NOT DISTINCT;

-- ------------------------------------------------------
-- 12. KPI RESULT
-- ------------------------------------------------------

ALTER TABLE kpi_results
  ADD CONSTRAINT kpi_results_kpi_amount_check
    CHECK (kpi_amount >= 0);

ALTER TABLE kpi_result_rules
  ADD CONSTRAINT kpi_result_rules_amount_check
    CHECK (amount >= 0);

-- ------------------------------------------------------
-- 13. PAYROLL
-- ------------------------------------------------------

-- recalculation_amount va net_amount manfiy bo'lishi mumkin.
ALTER TABLE payrolls
  ADD CONSTRAINT payrolls_non_negative_check
    CHECK (
      fixed_salary >= 0
      AND kpi_total >= 0
      AND bonus_total >= 0
      AND penalty_total >= 0
      AND advance_total >= 0
      AND deposit_amount >= 0
      AND debt_carryover_amount >= 0
      AND deposit_return_amount >= 0
      AND gross_amount >= 0
    ),
  ADD CONSTRAINT payrolls_payable_amount_check
    CHECK (payable_amount >= 0);

ALTER TABLE payroll_items
  ADD CONSTRAINT payroll_items_item_type_check
    CHECK (item_type IN ('FIXED_SALARY', 'KPI', 'BONUS', 'PENALTY', 'ADVANCE',
                         'DEPOSIT', 'DEPOSIT_RETURN', 'RECALCULATION', 'DEBT_CARRYOVER'));

ALTER TABLE payroll_payments
  ADD CONSTRAINT payroll_payments_method_check
    CHECK (method IN ('CARD', 'CASH')),
  ADD CONSTRAINT payroll_payments_amount_check
    CHECK (amount >= 0);

-- ------------------------------------------------------
-- 14. BONUS / PENALTY / ADVANCE
-- ------------------------------------------------------

ALTER TABLE bonuses   ADD CONSTRAINT bonuses_amount_check   CHECK (amount >= 0);
ALTER TABLE penalties ADD CONSTRAINT penalties_amount_check CHECK (amount >= 0);
ALTER TABLE advances  ADD CONSTRAINT advances_amount_check  CHECK (amount >= 0);

-- ------------------------------------------------------
-- 15. DEPOSIT
-- ------------------------------------------------------

ALTER TABLE deposits
  ADD CONSTRAINT deposits_deposit_percent_check
    CHECK (deposit_percent BETWEEN 0 AND 100),
  ADD CONSTRAINT deposits_deposit_amount_check
    CHECK (deposit_amount >= 0);

ALTER TABLE deposit_withdrawals
  ADD CONSTRAINT deposit_withdrawals_amount_check
    CHECK (amount > 0),
  ADD CONSTRAINT deposit_withdrawals_payout_type_check
    CHECK (payout_type IN ('PAYROLL', 'SEPARATE'));

-- ------------------------------------------------------
-- 16. DEBT
-- ------------------------------------------------------

ALTER TABLE employee_debts
  ADD CONSTRAINT employee_debts_amount_check
    CHECK (amount > 0),
  ADD CONSTRAINT employee_debts_status_check
    CHECK (status IN ('PENDING', 'APPLIED')),
  ADD CONSTRAINT employee_debts_periods_check
    CHECK (source_period_id <> target_period_id);

-- ------------------------------------------------------
-- 17. RECALCULATION
-- ------------------------------------------------------

ALTER TABLE recalculations
  ADD CONSTRAINT recalculations_periods_check
    CHECK (source_period_id <> target_period_id);

-- ------------------------------------------------------
-- 18. AUDIT — faqat INSERT
-- ------------------------------------------------------

CREATE FUNCTION audit_logs_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs: yozuvlarni o''zgartirish va o''chirish taqiqlangan (%)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_forbid_change();

CREATE TRIGGER audit_logs_no_truncate
  BEFORE TRUNCATE ON audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION audit_logs_forbid_change();
