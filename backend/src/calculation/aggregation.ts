import { CalculationError } from './calculation.errors';
import { Decimal, ZERO, toDecimal } from './decimal';
import {
  isSalesLineField,
  readSalesLineField,
  type SalesLineField,
  type SalesLineForCalculation,
} from './sales-line.types';

export const AGGREGATIONS = ['SUM', 'COUNT', 'COUNT_DISTINCT', 'COUNT_DISTINCT_POSITIVE'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

/**
 * ERD: kpi_definitions.aggregation + source_field.
 *   SUM            — source_field qiymatlari yig'indisi (amount, quantity)
 *   COUNT          — source_field bo'sh bo'lmagan qatorlar soni
 *   COUNT_DISTINCT — takrorlanmas qiymatlar soni
 *   COUNT_DISTINCT_POSITIVE — sof summasi (amount yig'indisi, qaytarishlar bilan) > 0
 *                    bo'lgan takrorlanmas qiymatlar soni.
 *                    AKB = COUNT_DISTINCT_POSITIVE client_id (DECISIONS 2.3).
 */
export function aggregate(
  lines: readonly SalesLineForCalculation[],
  aggregation: string,
  sourceField: string,
): Decimal {
  if (!isSalesLineField(sourceField)) {
    throw new CalculationError('INVALID_CONFIGURATION', `Noma'lum source_field: ${sourceField}`, {
      sourceField,
    });
  }
  const values = lines
    .map((line) => readSalesLineField(line, sourceField))
    .filter((v): v is string | number => v !== null && v !== undefined);

  switch (aggregation) {
    case 'SUM':
      return values.reduce<Decimal>((acc, v) => acc.plus(toDecimal(v)), ZERO);
    case 'COUNT':
      return new Decimal(values.length);
    case 'COUNT_DISTINCT':
      return new Decimal(new Set(values.map((v) => String(v))).size);
    case 'COUNT_DISTINCT_POSITIVE':
      return countDistinctWithPositiveNet(lines, sourceField);
    default:
      throw new CalculationError('UNKNOWN_AGGREGATION', `Noma'lum aggregation: ${aggregation}`, {
        aggregation,
      });
  }
}

/** Har bir qiymat (masalan mijoz) bo'yicha amount yig'indisi; > 0 bo'lganlar sanaladi. */
function countDistinctWithPositiveNet(
  lines: readonly SalesLineForCalculation[],
  sourceField: SalesLineField,
): Decimal {
  const netByKey = new Map<string, Decimal>();
  for (const line of lines) {
    const key = readSalesLineField(line, sourceField);
    if (key === null || key === undefined || line.amount === null || line.amount === undefined) {
      continue;
    }
    const k = String(key);
    netByKey.set(k, (netByKey.get(k) ?? ZERO).plus(toDecimal(line.amount)));
  }
  let count = 0;
  for (const net of netByKey.values()) {
    if (net.gt(0)) count += 1;
  }
  return new Decimal(count);
}
