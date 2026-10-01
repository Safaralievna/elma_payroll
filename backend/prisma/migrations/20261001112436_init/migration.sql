-- CreateTable
CREATE TABLE "departments" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "deposit_percent" DECIMAL(10,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" VARCHAR(50) NOT NULL,
    "first_name" VARCHAR(100),
    "last_name" VARCHAR(100),
    "middle_name" VARCHAR(100),
    "hire_date" DATE,
    "termination_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_assignments" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "department_id" BIGINT NOT NULL,
    "position_id" BIGINT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_salary_history" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "salary_amount" DECIMAL(18,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_salary_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_links" (
    "id" BIGSERIAL NOT NULL,
    "leader_id" BIGINT NOT NULL,
    "member_id" BIGINT NOT NULL,
    "link_type" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "user_id" BIGINT NOT NULL,
    "role_id" BIGINT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "kpi_units" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "description" VARCHAR(255),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "kpi_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_definitions" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "unit_id" BIGINT NOT NULL,
    "calculation_type" VARCHAR(50) NOT NULL,
    "aggregation" VARCHAR(30),
    "source_field" VARCHAR(100),
    "scope" VARCHAR(20) NOT NULL DEFAULT 'OWN',
    "team_link_type" VARCHAR(20),
    "fact_source" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "kpi_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_rules" (
    "id" BIGSERIAL NOT NULL,
    "kpi_id" BIGINT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "configuration" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "kpi_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_rule_steps" (
    "id" BIGSERIAL NOT NULL,
    "kpi_rule_id" BIGINT NOT NULL,
    "min_percent" DECIMAL(10,2) NOT NULL,
    "max_percent" DECIMAL(10,2),
    "coefficient" DECIMAL(10,4) NOT NULL,
    "max_reward_percent" DECIMAL(10,2),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_rule_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_rule_filters" (
    "id" BIGSERIAL NOT NULL,
    "kpi_rule_id" BIGINT NOT NULL,
    "field_name" VARCHAR(100) NOT NULL,
    "operator" VARCHAR(30) NOT NULL,
    "values" JSONB NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_rule_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "position_kpis" (
    "id" BIGSERIAL NOT NULL,
    "position_id" BIGINT NOT NULL,
    "kpi_id" BIGINT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "position_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_kpi_overrides" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kpi_id" BIGINT NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "employee_kpi_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" BIGSERIAL NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "calculated_by" BIGINT,
    "calculated_at" TIMESTAMP(6),
    "submitted_by" BIGINT,
    "submitted_at" TIMESTAMP(6),
    "closed_by" BIGINT,
    "opened_at" TIMESTAMP(6),
    "closed_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_plans" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kpi_id" BIGINT NOT NULL,
    "plan_value" DECIMAL(18,4),
    "base_amount" DECIMAL(18,2),
    "manual_amount" DECIMAL(18,2),
    "import_batch_id" BIGINT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "kpi_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_groups" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "product_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "product_group_id" BIGINT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_categories" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "client_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "client_category_id" BIGINT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_types" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "price_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT,
    "file_name" VARCHAR(255) NOT NULL,
    "file_hash" VARCHAR(64) NOT NULL,
    "import_type" VARCHAR(30) NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "imported_by" BIGINT NOT NULL,
    "imported_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" BIGSERIAL NOT NULL,
    "batch_id" BIGINT NOT NULL,
    "row_number" INTEGER NOT NULL,
    "employee_id" VARCHAR(50),
    "raw_data" JSONB,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_errors" (
    "id" BIGSERIAL NOT NULL,
    "import_row_id" BIGINT NOT NULL,
    "field_name" VARCHAR(100),
    "error_message" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validation_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_lines" (
    "id" BIGSERIAL NOT NULL,
    "import_batch_id" BIGINT NOT NULL,
    "import_row_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "product_id" BIGINT NOT NULL,
    "client_id" BIGINT NOT NULL,
    "price_type_id" BIGINT NOT NULL,
    "sale_date" DATE NOT NULL,
    "original_sale_date" DATE,
    "quantity" DECIMAL(18,4),
    "amount" DECIMAL(18,2),
    "raw_data" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_facts" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kpi_id" BIGINT NOT NULL,
    "import_batch_id" BIGINT,
    "fact_value" DECIMAL(18,4) NOT NULL,
    "calculated_at" TIMESTAMP(6),
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_results" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "kpi_id" BIGINT NOT NULL,
    "plan_value" DECIMAL(18,4),
    "fact_value" DECIMAL(18,4),
    "base_amount" DECIMAL(18,2),
    "achievement_percent" DECIMAL(10,4),
    "kpi_amount" DECIMAL(18,2) NOT NULL,
    "calculated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_result_rules" (
    "id" BIGSERIAL NOT NULL,
    "kpi_result_id" BIGINT NOT NULL,
    "kpi_rule_id" BIGINT NOT NULL,
    "fact_value" DECIMAL(18,4),
    "achievement_percent" DECIMAL(10,4),
    "payout_percent" DECIMAL(10,4),
    "amount" DECIMAL(18,2) NOT NULL,
    "warnings" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_result_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payrolls" (
    "id" BIGSERIAL NOT NULL,
    "period_id" BIGINT NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "fixed_salary" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "kpi_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "bonus_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "penalty_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "advance_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposit_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "recalculation_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "debt_carryover_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deposit_return_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "net_amount" DECIMAL(18,2) NOT NULL,
    "payable_amount" DECIMAL(18,2) NOT NULL,
    "warnings" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_items" (
    "id" BIGSERIAL NOT NULL,
    "payroll_id" BIGINT NOT NULL,
    "item_type" VARCHAR(50) NOT NULL,
    "description" VARCHAR(255),
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_payments" (
    "id" BIGSERIAL NOT NULL,
    "payroll_id" BIGINT NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonuses" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "period_id" BIGINT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalties" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "period_id" BIGINT NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advances" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "period_id" BIGINT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "period_id" BIGINT NOT NULL,
    "base_amount" DECIMAL(18,2) NOT NULL,
    "deposit_percent" DECIMAL(10,2) NOT NULL,
    "deposit_amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_withdrawals" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "period_id" BIGINT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "payout_type" VARCHAR(20) NOT NULL,
    "created_by" BIGINT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_debts" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "source_period_id" BIGINT NOT NULL,
    "target_period_id" BIGINT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_debts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recalculations" (
    "id" BIGSERIAL NOT NULL,
    "employee_id" BIGINT NOT NULL,
    "source_period_id" BIGINT NOT NULL,
    "target_period_id" BIGINT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT NOT NULL,

    CONSTRAINT "recalculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT,
    "action" VARCHAR(50) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" BIGINT,
    "old_data" JSONB,
    "new_data" JSONB,
    "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_employee_id_key" ON "employees"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_assignments_employee_id_start_date_key" ON "employee_assignments"("employee_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_salary_history_employee_id_start_date_key" ON "employee_salary_history"("employee_id", "start_date");

-- CreateIndex
CREATE INDEX "team_links_leader_id_link_type_idx" ON "team_links"("leader_id", "link_type");

-- CreateIndex
CREATE INDEX "team_links_member_id_idx" ON "team_links"("member_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_id_key" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_units_code_key" ON "kpi_units"("code");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_definitions_code_key" ON "kpi_definitions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_rules_kpi_id_priority_key" ON "kpi_rules"("kpi_id", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_rule_steps_kpi_rule_id_min_percent_key" ON "kpi_rule_steps"("kpi_rule_id", "min_percent");

-- CreateIndex
CREATE INDEX "kpi_rule_filters_kpi_rule_id_idx" ON "kpi_rule_filters"("kpi_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "position_kpis_position_id_kpi_id_start_date_key" ON "position_kpis"("position_id", "kpi_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "employee_kpi_overrides_employee_id_kpi_id_start_date_key" ON "employee_kpi_overrides"("employee_id", "kpi_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_year_month_key" ON "payroll_periods"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_plans_period_id_employee_id_kpi_id_key" ON "kpi_plans"("period_id", "employee_id", "kpi_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_groups_code_key" ON "product_groups"("code");

-- CreateIndex
CREATE UNIQUE INDEX "products_code_key" ON "products"("code");

-- CreateIndex
CREATE UNIQUE INDEX "client_categories_code_key" ON "client_categories"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE UNIQUE INDEX "price_types_code_key" ON "price_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_version_key" ON "import_batches"("period_id", "import_type", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_file_hash_key" ON "import_batches"("period_id", "import_type", "file_hash");

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_batch_id_row_number_key" ON "import_rows"("batch_id", "row_number");

-- CreateIndex
CREATE INDEX "validation_errors_import_row_id_idx" ON "validation_errors"("import_row_id");

-- CreateIndex
CREATE INDEX "sales_lines_import_batch_id_idx" ON "sales_lines"("import_batch_id");

-- CreateIndex
CREATE INDEX "sales_lines_import_batch_id_employee_id_idx" ON "sales_lines"("import_batch_id", "employee_id");

-- CreateIndex
CREATE INDEX "sales_lines_product_id_idx" ON "sales_lines"("product_id");

-- CreateIndex
CREATE INDEX "sales_lines_client_id_idx" ON "sales_lines"("client_id");

-- CreateIndex
CREATE INDEX "sales_lines_price_type_id_idx" ON "sales_lines"("price_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_facts_period_id_employee_id_kpi_id_key" ON "kpi_facts"("period_id", "employee_id", "kpi_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_results_period_id_employee_id_kpi_id_key" ON "kpi_results"("period_id", "employee_id", "kpi_id");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_result_rules_kpi_result_id_kpi_rule_id_key" ON "kpi_result_rules"("kpi_result_id", "kpi_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "payrolls_period_id_employee_id_key" ON "payrolls"("period_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_items_payroll_id_idx" ON "payroll_items"("payroll_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_payments_payroll_id_method_key" ON "payroll_payments"("payroll_id", "method");

-- CreateIndex
CREATE INDEX "bonuses_period_id_employee_id_idx" ON "bonuses"("period_id", "employee_id");

-- CreateIndex
CREATE INDEX "penalties_period_id_employee_id_idx" ON "penalties"("period_id", "employee_id");

-- CreateIndex
CREATE INDEX "advances_period_id_employee_id_idx" ON "advances"("period_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_employee_id_period_id_key" ON "deposits"("employee_id", "period_id");

-- CreateIndex
CREATE INDEX "deposit_withdrawals_employee_id_idx" ON "deposit_withdrawals"("employee_id");

-- CreateIndex
CREATE INDEX "deposit_withdrawals_period_id_idx" ON "deposit_withdrawals"("period_id");

-- CreateIndex
CREATE INDEX "employee_debts_target_period_id_idx" ON "employee_debts"("target_period_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_debts_employee_id_source_period_id_key" ON "employee_debts"("employee_id", "source_period_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "employee_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_salary_history" ADD CONSTRAINT "employee_salary_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_links" ADD CONSTRAINT "team_links_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_links" ADD CONSTRAINT "team_links_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "kpi_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rules" ADD CONSTRAINT "kpi_rules_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rule_steps" ADD CONSTRAINT "kpi_rule_steps_kpi_rule_id_fkey" FOREIGN KEY ("kpi_rule_id") REFERENCES "kpi_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rule_filters" ADD CONSTRAINT "kpi_rule_filters_kpi_rule_id_fkey" FOREIGN KEY ("kpi_rule_id") REFERENCES "kpi_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_kpis" ADD CONSTRAINT "position_kpis_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_kpis" ADD CONSTRAINT "position_kpis_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_overrides" ADD CONSTRAINT "employee_kpi_overrides_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_kpi_overrides" ADD CONSTRAINT "employee_kpi_overrides_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_closed_by_fkey" FOREIGN KEY ("closed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_plans" ADD CONSTRAINT "kpi_plans_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_plans" ADD CONSTRAINT "kpi_plans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_plans" ADD CONSTRAINT "kpi_plans_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_plans" ADD CONSTRAINT "kpi_plans_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_product_group_id_fkey" FOREIGN KEY ("product_group_id") REFERENCES "product_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_client_category_id_fkey" FOREIGN KEY ("client_category_id") REFERENCES "client_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_errors" ADD CONSTRAINT "validation_errors_import_row_id_fkey" FOREIGN KEY ("import_row_id") REFERENCES "import_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_import_row_id_fkey" FOREIGN KEY ("import_row_id") REFERENCES "import_rows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lines" ADD CONSTRAINT "sales_lines_price_type_id_fkey" FOREIGN KEY ("price_type_id") REFERENCES "price_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_facts" ADD CONSTRAINT "kpi_facts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_facts" ADD CONSTRAINT "kpi_facts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_facts" ADD CONSTRAINT "kpi_facts_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_facts" ADD CONSTRAINT "kpi_facts_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_results" ADD CONSTRAINT "kpi_results_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_results" ADD CONSTRAINT "kpi_results_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_results" ADD CONSTRAINT "kpi_results_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "kpi_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_result_rules" ADD CONSTRAINT "kpi_result_rules_kpi_result_id_fkey" FOREIGN KEY ("kpi_result_id") REFERENCES "kpi_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_result_rules" ADD CONSTRAINT "kpi_result_rules_kpi_rule_id_fkey" FOREIGN KEY ("kpi_rule_id") REFERENCES "kpi_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payrolls" ADD CONSTRAINT "payrolls_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_items" ADD CONSTRAINT "payroll_items_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_payroll_id_fkey" FOREIGN KEY ("payroll_id") REFERENCES "payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advances" ADD CONSTRAINT "advances_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_withdrawals" ADD CONSTRAINT "deposit_withdrawals_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_withdrawals" ADD CONSTRAINT "deposit_withdrawals_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_withdrawals" ADD CONSTRAINT "deposit_withdrawals_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_debts" ADD CONSTRAINT "employee_debts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_debts" ADD CONSTRAINT "employee_debts_source_period_id_fkey" FOREIGN KEY ("source_period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_debts" ADD CONSTRAINT "employee_debts_target_period_id_fkey" FOREIGN KEY ("target_period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalculations" ADD CONSTRAINT "recalculations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalculations" ADD CONSTRAINT "recalculations_source_period_id_fkey" FOREIGN KEY ("source_period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalculations" ADD CONSTRAINT "recalculations_target_period_id_fkey" FOREIGN KEY ("target_period_id") REFERENCES "payroll_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recalculations" ADD CONSTRAINT "recalculations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
