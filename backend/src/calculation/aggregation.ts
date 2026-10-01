import { CalculationError } from './calculation.errors';
import { Decimal, ZERO, toDecimal } from './decimal';
import {
  isSalesLineField,
  readSalesLineField,
  type SalesLineForCalculation,
} from './sales-line.types';

export const AGGREGATIONS = ['SUM', 'COUNT', 'COUNT_DISTINCT'] as const;
export type Aggregation = (typeof AGGREGATIONS)[number];

/**
 * ERD: kpi_definitions.aggregation + source_field.
 *   SUM            — source_field qiymatlari yig'indisi (amount, quantity)
 *   COUNT          — source_field bo'sh bo'lmagan qatorlar soni
 *   COUNT_DISTINCT — takrorlanmas qiymatlar soni (AKB = COUNT_DISTINCT client_id)
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
    default:
      throw new CalculationError('UNKNOWN_AGGREGATION', `Noma'lum aggregation: ${aggregation}`, {
        aggregation,
      });
  }
}
