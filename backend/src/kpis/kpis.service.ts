import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { Page } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';
import { requireActive } from '../history/history-db';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigIssue, KpiShape, normalizeConfiguration, RuleShape, validateKpiConfig } from './kpi-config';
import { loadReferences, requireReferences } from './kpi-references';
import {
  KPI_INCLUDE,
  KpiDefinitionView,
  KpiRow,
  KpiView,
  RULE_INCLUDE,
  RuleRow,
  RuleView,
  snapshot,
  toDefinitionView,
  toKpiShape,
  toKpiView,
  toRuleShape,
  toRuleView,
} from './kpi-view';
import { CreateKpiInput, KpiListQuery, RuleInput, UpdateKpiInput } from './kpis.schemas';

type Tx = Prisma.TransactionClient;

export type KpiSummaryView = KpiDefinitionView & { ruleCount: number };

/** Natijasi bor KPI'da o'zgarmaydigan maydonlar (DECISIONS 2.5). */
const STRUCTURAL_FIELDS = ['calculationType', 'aggregation', 'sourceField', 'scope', 'teamLinkType', 'factSource'] as const;

/**
 * KPI konstruktor: KPI ta'rifi va qoidalari (pog'ona, filtr bilan).
 *
 * Har bir o'zgarishda KPI butunligicha (hamma qoidalari bilan) kpi-config.ts orqali
 * tekshiriladi — qoidalar bir-biriga bog'liq (priority, bitta faol qoida, filtrsiz qoida).
 * Yozish — KPI qatori FOR UPDATE bilan qulflanib, bitta tranzaksiyada, audit bilan.
 * KPI o'chirilmaydi — nofaol qilinadi.
 */
@Injectable()
export class KpisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: KpiListQuery): Promise<Page<KpiSummaryView>> {
    const where: Prisma.KpiDefinitionWhereInput = {
      isActive: query.isActive,
      calculationType: query.calculationType,
      OR: query.search
        ? [
            { code: { contains: query.search, mode: 'insensitive' } },
            { name: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [total, rows] = await Promise.all([
      this.prisma.kpiDefinition.count({ where }),
      this.prisma.kpiDefinition.findMany({
        where,
        include: { unit: { select: { code: true, name: true } }, _count: { select: { rules: true } } },
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({ ...toDefinitionView(row), ruleCount: row._count.rules })),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(code: string): Promise<KpiView> {
    const row = await this.prisma.kpiDefinition.findUnique({ where: { code }, include: KPI_INCLUDE });
    if (!row) throw kpiNotFound(code);
    return fullView(this.prisma, row);
  }

  async create(actor: AuthUser, input: CreateKpiInput): Promise<KpiView> {
    const definition: KpiShape = toKpiShape(input);
    const rules = input.rules.map((rule, index) => toShape(rule, `rules.${index}`));
    assertValid(validateKpiConfig(definition, rules));

    return this.prisma.$transaction(async (tx) => {
      if (await tx.kpiDefinition.findUnique({ where: { code: input.code } })) {
        throw new AppError(HttpStatus.CONFLICT, 'CODE_TAKEN', `KPI kodi band: ${input.code}`);
      }
      await requireUnit(tx, input.unitId);
      await requireReferences(
        tx,
        rules.flatMap((rule) => rule.filters),
      );

      const { rules: _rules, ...data } = input;
      const kpi = await tx.kpiDefinition.create({ data });
      for (const [index, rule] of input.rules.entries()) await insertRule(tx, kpi.id, rule, rules[index]);

      const view = await fullView(tx, await tx.kpiDefinition.findUniqueOrThrow({ where: { id: kpi.id }, include: KPI_INCLUDE }));
      const { positions: _positions, ...created } = snapshot(view);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'KPI_CREATE',
        entityType: 'kpi_definitions',
        entityId: kpi.id,
        newData: created,
      });
      return view;
    });
  }

  async update(actor: AuthUser, code: string, input: UpdateKpiInput): Promise<KpiView> {
    return this.prisma.$transaction(async (tx) => {
      const before = await lockKpi(tx, code);
      const structural = STRUCTURAL_FIELDS.filter((field) => input[field] !== undefined && input[field] !== before[field]);

      if (structural.length > 0) {
        if ((await tx.kpiResult.count({ where: { kpiId: before.id } })) > 0) {
          throw new AppError(
            HttpStatus.CONFLICT,
            'KPI_IN_USE',
            `KPI bo'yicha hisoblangan natijalar bor — ${structural.join(', ')} o'zgartirilmaydi, yangi KPI yarating`,
          );
        }
        const merged: KpiShape = { ...toKpiShape(before), ...pickDefined(input, STRUCTURAL_FIELDS) };
        assertValid(validateKpiConfig(merged, before.rules.map((rule) => toRuleShape(rule))));
      }
      if (input.unitId !== undefined && input.unitId !== before.unitId) await requireUnit(tx, input.unitId);
      if (input.isActive === false && before.isActive) await ensureNoOpenLinks(tx, before.id);

      const after = await tx.kpiDefinition.update({ where: { id: before.id }, data: input, include: KPI_INCLUDE });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'KPI_UPDATE',
        entityType: 'kpi_definitions',
        entityId: before.id,
        oldData: snapshot(toDefinitionView(before)),
        newData: snapshot(toDefinitionView(after)),
      });
      return fullView(tx, after);
    });
  }

  // ---------- Qoidalar ----------

  async createRule(actor: AuthUser, code: string, input: RuleInput): Promise<RuleView> {
    return this.prisma.$transaction(async (tx) => {
      const kpi = await lockKpi(tx, code);
      const shape = toShape(input, '');
      assertValid(validateKpiConfig(toKpiShape(kpi), [...kpi.rules.map((rule) => toRuleShape(rule)), shape]));
      await requireReferences(tx, shape.filters);

      const rule = await insertRule(tx, kpi.id, input, shape);
      const view = await ruleView(tx, rule);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'KPI_RULE_CREATE',
        entityType: 'kpi_rules',
        entityId: rule.id,
        newData: snapshot(view),
      });
      return view;
    });
  }

  /** To'liq almashtirish: pog'onalar va filtrlar o'chirilib qayta yoziladi (ularga hech narsa bog'lanmagan). */
  async replaceRule(actor: AuthUser, code: string, ruleId: bigint, input: RuleInput): Promise<RuleView> {
    return this.prisma.$transaction(async (tx) => {
      const kpi = await lockKpi(tx, code);
      const target = requireRule(kpi, ruleId);
      const shape = toShape(input, '');
      const others = kpi.rules.filter((rule) => rule.id !== ruleId).map((rule) => toRuleShape(rule));
      assertValid(validateKpiConfig(toKpiShape(kpi), [...others, shape]));
      await requireReferences(tx, shape.filters);

      const before = await ruleView(tx, target);
      await tx.kpiRuleStep.deleteMany({ where: { kpiRuleId: ruleId } });
      await tx.kpiRuleFilter.deleteMany({ where: { kpiRuleId: ruleId } });
      await tx.kpiRule.update({
        where: { id: ruleId },
        data: {
          name: input.name,
          priority: input.priority,
          isActive: input.isActive,
          configuration: normalizeConfiguration(input.configuration),
        },
      });
      await insertChildren(tx, ruleId, shape);

      const view = await ruleView(tx, await tx.kpiRule.findUniqueOrThrow({ where: { id: ruleId }, include: RULE_INCLUDE }));
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'KPI_RULE_UPDATE',
        entityType: 'kpi_rules',
        entityId: ruleId,
        oldData: snapshot(before),
        newData: snapshot(view),
      });
      return view;
    });
  }

  /** Natijasi bor qoida o'chirilmaydi — nofaol qilinadi (natijalar unga bog'langan). */
  async deleteRule(actor: AuthUser, code: string, ruleId: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const kpi = await lockKpi(tx, code);
      const target = requireRule(kpi, ruleId);
      if ((await tx.kpiResultRule.count({ where: { kpiRuleId: ruleId } })) > 0) {
        throw new AppError(
          HttpStatus.CONFLICT,
          'RULE_IN_USE',
          "Qoida bo'yicha hisoblangan natijalar bor — o'chirib bo'lmaydi, nofaol qiling (isActive = false)",
        );
      }
      const remaining = kpi.rules.filter((rule) => rule.id !== ruleId).map((rule) => toRuleShape(rule));
      assertValid(validateKpiConfig(toKpiShape(kpi), remaining));

      const before = await ruleView(tx, target);
      await tx.kpiRuleStep.deleteMany({ where: { kpiRuleId: ruleId } });
      await tx.kpiRuleFilter.deleteMany({ where: { kpiRuleId: ruleId } });
      await tx.kpiRule.delete({ where: { id: ruleId } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'KPI_RULE_DELETE',
        entityType: 'kpi_rules',
        entityId: ruleId,
        oldData: snapshot(before),
      });
    });
  }
}

// ---------------------------------------------------------------------------

/** KPI kodi bo'yicha, qatorni qulflab (qoidalar bilan birga o'qiladi). */
async function lockKpi(tx: Tx, code: string): Promise<KpiRow> {
  const found = await tx.kpiDefinition.findUnique({ where: { code }, select: { id: true } });
  if (!found) throw kpiNotFound(code);
  await tx.$queryRaw`SELECT id FROM kpi_definitions WHERE id = ${found.id} FOR UPDATE`;
  return tx.kpiDefinition.findUniqueOrThrow({ where: { id: found.id }, include: KPI_INCLUDE });
}

function kpiNotFound(code: string): AppError {
  return new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `KPI topilmadi: ${code}`);
}

function requireRule(kpi: KpiRow, ruleId: bigint): RuleRow {
  const rule = kpi.rules.find((item) => item.id === ruleId);
  if (!rule) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Qoida topilmadi (id=${ruleId}) — ${kpi.code} KPI'sida yo'q`);
  return rule;
}

function assertValid(issues: ConfigIssue[]): void {
  if (issues.length > 0) {
    throw new AppError(HttpStatus.BAD_REQUEST, 'INVALID_CONFIGURATION', "KPI konfiguratsiyasi noto'g'ri", issues);
  }
}

function toShape(rule: RuleInput, path: string): RuleShape {
  return {
    path,
    priority: rule.priority,
    isActive: rule.isActive,
    configuration: rule.configuration,
    steps: rule.steps,
    filters: rule.filters,
  };
}

function pickDefined<T extends object, K extends keyof T>(input: T, keys: readonly K[]): Partial<Pick<T, K>> {
  return Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((key) => [key, input[key]])) as Partial<Pick<T, K>>;
}

async function requireUnit(tx: Tx, unitId: bigint): Promise<void> {
  const unit = await tx.kpiUnit.findUnique({ where: { id: unitId } });
  if (!unit) throw new AppError(HttpStatus.NOT_FOUND, 'REFERENCE_NOT_FOUND', `O'lchov birligi topilmadi (id=${unitId})`);
  requireActive(unit, "O'lchov birligi");
}

/** KPI nofaol qilinishidan oldin uning ochiq (end_date bo'sh) biriktirishlari yopilgan bo'lishi kerak. */
async function ensureNoOpenLinks(tx: Tx, kpiId: bigint): Promise<void> {
  const [positions, overrides] = await Promise.all([
    tx.positionKpi.count({ where: { kpiId, endDate: null } }),
    tx.employeeKpiOverride.count({ where: { kpiId, endDate: null } }),
  ]);
  if (positions + overrides > 0) {
    throw new AppError(
      HttpStatus.CONFLICT,
      'KPI_IN_USE',
      `KPI'ning ochiq biriktirishlari bor (lavozim: ${positions}, override: ${overrides}) — avval ularni yoping`,
    );
  }
}

async function insertRule(tx: Tx, kpiId: bigint, input: RuleInput, shape: RuleShape): Promise<RuleRow> {
  const rule = await tx.kpiRule.create({
    data: {
      kpiId,
      name: input.name,
      priority: input.priority,
      isActive: input.isActive,
      configuration: normalizeConfiguration(input.configuration),
    },
  });
  await insertChildren(tx, rule.id, shape);
  return tx.kpiRule.findUniqueOrThrow({ where: { id: rule.id }, include: RULE_INCLUDE });
}

async function insertChildren(tx: Tx, kpiRuleId: bigint, shape: RuleShape): Promise<void> {
  if (shape.steps.length > 0) {
    await tx.kpiRuleStep.createMany({ data: shape.steps.map((step) => ({ kpiRuleId, ...step })) });
  }
  if (shape.filters.length > 0) {
    await tx.kpiRuleFilter.createMany({ data: shape.filters.map((filter) => ({ kpiRuleId, ...filter })) });
  }
}

async function ruleView(db: Tx, rule: RuleRow): Promise<RuleView> {
  return toRuleView(rule, await loadReferences(db, toRuleShape(rule).filters));
}

async function fullView(db: Tx, row: KpiRow): Promise<KpiView> {
  const filters = row.rules.flatMap((rule) => toRuleShape(rule).filters);
  return toKpiView(row, await loadReferences(db, filters));
}
