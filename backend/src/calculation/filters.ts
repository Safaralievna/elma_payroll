import { CalculationError } from './calculation.errors';
import { Decimal, toDecimal } from './decimal';
import {
  isSalesLineField,
  readSalesLineField,
  type SalesLineForCalculation,
} from './sales-line.types';

export const FILTER_OPERATORS = ['=', '!=', 'IN', 'NOT_IN', '>', '>=', '<', '<='] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

/** ERD: kpi_rule_filters qatori. `values` — jsonb (bitta qiymat yoki massiv). */
export interface RuleFilter {
  fieldName: string;
  operator: string;
  values: unknown;
}

function isOperator(value: string): value is FilterOperator {
  return (FILTER_OPERATORS as readonly string[]).includes(value);
}

function asList(values: unknown, filter: RuleFilter): string[] {
  const list = Array.isArray(values) ? values : [values];
  if (list.length === 0 || list.some((v) => typeof v !== 'string' && typeof v !== 'number')) {
    throw new CalculationError('INVALID_FILTER_VALUE', 'Filtr qiymati noto\'g\'ri', {
      fieldName: filter.fieldName,
      operator: filter.operator,
    });
  }
  return list.map((v) => String(v));
}

function asSingle(values: unknown, filter: RuleFilter): string {
  const list = asList(values, filter);
  if (list.length !== 1) {
    throw new CalculationError('INVALID_FILTER_VALUE', `"${filter.operator}" bitta qiymat talab qiladi`, {
      fieldName: filter.fieldName,
    });
  }
  return list[0];
}

function compareNumeric(lineValue: string, filterValue: string, filter: RuleFilter): number {
  let left: Decimal;
  let right: Decimal;
  try {
    left = toDecimal(lineValue);
    right = toDecimal(filterValue);
  } catch {
    throw new CalculationError('INVALID_FILTER_VALUE', 'Taqqoslash uchun son kerak', {
      fieldName: filter.fieldName,
    });
  }
  return left.comparedTo(right);
}

/** Qator bitta filtrga mos keladimi. */
export function matchesFilter(line: SalesLineForCalculation, filter: RuleFilter): boolean {
  if (!isSalesLineField(filter.fieldName)) {
    throw new CalculationError('INVALID_FILTER_VALUE', `Noma'lum filtr maydoni: ${filter.fieldName}`, {
      fieldName: filter.fieldName,
    });
  }
  if (!isOperator(filter.operator)) {
    throw new CalculationError('UNKNOWN_FILTER_OPERATOR', `Noma'lum operator: ${filter.operator}`, {
      operator: filter.operator,
    });
  }

  const raw = readSalesLineField(line, filter.fieldName);
  const value = raw === null || raw === undefined ? null : String(raw);

  switch (filter.operator) {
    case '=':
      return value !== null && value === asSingle(filter.values, filter);
    case '!=':
      // Qiymati yo'q qator "X emas" shartiga mos keladi.
      return value === null || value !== asSingle(filter.values, filter);
    case 'IN':
      return value !== null && asList(filter.values, filter).includes(value);
    case 'NOT_IN':
      return value === null || !asList(filter.values, filter).includes(value);
    case '>':
      return value !== null && compareNumeric(value, asSingle(filter.values, filter), filter) > 0;
    case '>=':
      return value !== null && compareNumeric(value, asSingle(filter.values, filter), filter) >= 0;
    case '<':
      return value !== null && compareNumeric(value, asSingle(filter.values, filter), filter) < 0;
    case '<=':
      return value !== null && compareNumeric(value, asSingle(filter.values, filter), filter) <= 0;
  }
}

/** Qoida ichidagi filtrlar AND bilan birlashadi. Filtr yo'q → hamma qator mos. */
export function matchesAllFilters(line: SalesLineForCalculation, filters: readonly RuleFilter[]): boolean {
  return filters.every((f) => matchesFilter(line, f));
}

export function applyFilters(
  lines: readonly SalesLineForCalculation[],
  filters: readonly RuleFilter[],
): SalesLineForCalculation[] {
  return lines.filter((line) => matchesAllFilters(line, filters));
}
