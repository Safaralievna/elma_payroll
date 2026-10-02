import { dateOrNull, dateToIso } from '../common/iso-date';
import { Prisma } from '../generated/prisma/client';
import { FilterShape, KpiShape, RuleShape, StepShape } from './kpi-config';
import { ReferenceInfo, referenceKey } from './kpi-references';

export const RULE_INCLUDE = {
  steps: { orderBy: { minPercent: 'asc' } },
  filters: { orderBy: { id: 'asc' } },
} satisfies Prisma.KpiRuleInclude;

export const POSITION_KPI_INCLUDE = {
  position: { select: { code: true, name: true } },
  kpi: { select: { code: true, name: true } },
} satisfies Prisma.PositionKpiInclude;

export const KPI_INCLUDE = {
  unit: { select: { code: true, name: true } },
  rules: { include: RULE_INCLUDE, orderBy: { priority: 'asc' } },
  positionKpis: { include: POSITION_KPI_INCLUDE, orderBy: [{ startDate: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.KpiDefinitionInclude;

export const OVERRIDE_INCLUDE = {
  kpi: { select: { code: true, name: true } },
} satisfies Prisma.EmployeeKpiOverrideInclude;

export type RuleRow = Prisma.KpiRuleGetPayload<{ include: typeof RULE_INCLUDE }>;
export type KpiRow = Prisma.KpiDefinitionGetPayload<{ include: typeof KPI_INCLUDE }>;
export type PositionKpiRow = Prisma.PositionKpiGetPayload<{ include: typeof POSITION_KPI_INCLUDE }>;
export type OverrideRow = Prisma.EmployeeKpiOverrideGetPayload<{ include: typeof OVERRIDE_INCLUDE }>;

export interface FilterView extends FilterShape {
  /** ID maydonlar uchun — har bir ID'ning kodi va nomi; amount/quantity uchun null. */
  references: ReferenceInfo[] | null;
}

export interface RuleView {
  id: string;
  kpiId: string;
  name: string;
  priority: number;
  isActive: boolean;
  configuration: Record<string, unknown>;
  steps: StepShape[];
  filters: FilterView[];
}

export interface KpiDefinitionView {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unitId: string;
  unitCode: string;
  unitName: string;
  calculationType: string;
  aggregation: string | null;
  sourceField: string | null;
  scope: string;
  teamLinkType: string | null;
  factSource: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KpiView extends KpiDefinitionView {
  rules: RuleView[];
  positions: PositionKpiView[];
}

export interface PositionKpiView {
  id: string;
  positionId: string;
  positionCode: string | null;
  positionName: string;
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export interface OverrideView {
  id: string;
  employeeCode: string;
  kpiId: string;
  kpiCode: string;
  kpiName: string;
  action: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}

export function toKpiShape(row: {
  calculationType: string;
  aggregation: string | null;
  sourceField: string | null;
  scope: string;
  teamLinkType: string | null;
  factSource: string;
}): KpiShape {
  return {
    calculationType: row.calculationType,
    aggregation: row.aggregation,
    sourceField: row.sourceField,
    scope: row.scope,
    teamLinkType: row.teamLinkType,
    factSource: row.factSource,
  };
}

/** Bazadagi qoida → validatsiya shakli. Xato yo'lida qoida id'si: "rules[id=5]". */
export function toRuleShape(row: RuleRow, path = `rules[id=${row.id}]`): RuleShape {
  return {
    path,
    priority: row.priority,
    isActive: row.isActive,
    configuration: (row.configuration ?? {}) as Record<string, unknown>,
    steps: row.steps.map((step) => ({
      minPercent: step.minPercent.toString(),
      maxPercent: step.maxPercent?.toString() ?? null,
      coefficient: step.coefficient.toString(),
      maxRewardPercent: step.maxRewardPercent?.toString() ?? null,
    })),
    filters: row.filters.map((filter) => ({
      fieldName: filter.fieldName,
      operator: filter.operator,
      values: filter.values as string[],
    })),
  };
}

export function toRuleView(row: RuleRow, references: ReadonlyMap<string, ReferenceInfo>): RuleView {
  const shape = toRuleShape(row);
  return {
    id: row.id.toString(),
    kpiId: row.kpiId.toString(),
    name: row.name,
    priority: row.priority,
    isActive: row.isActive,
    configuration: shape.configuration,
    steps: shape.steps,
    filters: shape.filters.map((filter) => ({
      ...filter,
      references: isReferenceField(filter.fieldName)
        ? filter.values.map(
            (id) => references.get(referenceKey(filter.fieldName, id)) ?? { id, code: null, name: null, isActive: false },
          )
        : null,
    })),
  };
}

export function toDefinitionView(row: Omit<KpiRow, 'rules' | 'positionKpis'>): KpiDefinitionView {
  return {
    id: row.id.toString(),
    code: row.code,
    name: row.name,
    description: row.description,
    unitId: row.unitId.toString(),
    unitCode: row.unit.code,
    unitName: row.unit.name,
    calculationType: row.calculationType,
    aggregation: row.aggregation,
    sourceField: row.sourceField,
    scope: row.scope,
    teamLinkType: row.teamLinkType,
    factSource: row.factSource,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toKpiView(row: KpiRow, references: ReadonlyMap<string, ReferenceInfo>): KpiView {
  return {
    ...toDefinitionView(row),
    rules: row.rules.map((rule) => toRuleView(rule, references)),
    positions: row.positionKpis.map(toPositionKpiView),
  };
}

export function toPositionKpiView(row: PositionKpiRow): PositionKpiView {
  return {
    id: row.id.toString(),
    positionId: row.positionId.toString(),
    positionCode: row.position.code,
    positionName: row.position.name,
    kpiId: row.kpiId.toString(),
    kpiCode: row.kpi.code,
    kpiName: row.kpi.name,
    startDate: dateToIso(row.startDate),
    endDate: dateOrNull(row.endDate),
    isActive: row.isActive,
  };
}

export function toOverrideView(row: OverrideRow, employeeCode: string): OverrideView {
  return {
    id: row.id.toString(),
    employeeCode,
    kpiId: row.kpiId.toString(),
    kpiCode: row.kpi.code,
    kpiName: row.kpi.name,
    action: row.action,
    startDate: dateToIso(row.startDate),
    endDate: dateOrNull(row.endDate),
    isActive: row.isActive,
  };
}

/** Audit uchun: id va vaqtlarsiz. */
export function snapshot<T extends { id: string }>(view: T): Omit<T, 'id' | 'createdAt' | 'updatedAt'> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = view as T & {
    createdAt?: string;
    updatedAt?: string;
  };
  return rest;
}

function isReferenceField(fieldName: string): boolean {
  return fieldName !== 'amount' && fieldName !== 'quantity';
}
