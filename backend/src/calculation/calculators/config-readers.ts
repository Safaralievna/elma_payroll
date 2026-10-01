import { CalculationError } from '../calculation.errors';
import type { RuleConfiguration } from '../calculation.types';
import { Decimal, toDecimal } from '../decimal';

/**
 * kpi_rules.configuration (jsonb) dan qiymat o'qish.
 * Qiymat son yoki son-satr bo'lishi mumkin ("5", 5, "0.005").
 */
function readRaw(config: RuleConfiguration, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(config, key) ? config[key] : undefined;
}

function parseDecimal(raw: unknown, key: string): Decimal {
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new CalculationError('INVALID_CONFIGURATION', `"${key}" son bo'lishi kerak`, { key, value: raw });
  }
  try {
    return toDecimal(raw);
  } catch {
    throw new CalculationError('INVALID_CONFIGURATION', `"${key}" son bo'lishi kerak`, { key, value: raw });
  }
}

export function requireConfigDecimal(config: RuleConfiguration, key: string): Decimal {
  const raw = readRaw(config, key);
  if (raw === undefined || raw === null) {
    throw new CalculationError('INVALID_CONFIGURATION', `Konfiguratsiyada "${key}" yo'q`, { key });
  }
  return parseDecimal(raw, key);
}

export function optionalConfigDecimal(config: RuleConfiguration, key: string): Decimal | null {
  const raw = readRaw(config, key);
  return raw === undefined || raw === null ? null : parseDecimal(raw, key);
}

export function requireNonNegative(value: Decimal, key: string): Decimal {
  if (value.isNegative()) {
    throw new CalculationError('INVALID_CONFIGURATION', `"${key}" manfiy bo'lmasligi kerak`, {
      key,
      value: value.toString(),
    });
  }
  return value;
}
