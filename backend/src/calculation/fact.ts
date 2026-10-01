import { aggregate } from './aggregation';
import { CalculationError } from './calculation.errors';
import type { Decimal } from './decimal';
import { applyFilters, type RuleFilter } from './filters';
import type { SalesLineForCalculation } from './sales-line.types';

export type KpiScope = 'OWN' | 'TEAM';

export interface ScopeInput {
  scope: string;
  employeeId: string;
  /**
   * scope = TEAM bo'lsa — shu xodimga (manager_id bo'yicha) bo'ysunadigan xodimlar.
   * Ro'yxatni hisoblanayotgan davrdagi employee_assignments dan servis qatlami
   * aniqlaydi (tarixiy holat). Yadro bu ro'yxatni tayyor holda oladi.
   */
  teamMemberIds?: readonly string[];
}

/**
 * OWN  → faqat xodimning o'z savdosi.
 * TEAM → faqat jamoa a'zolarining savdosi (xodimning o'zi kirmaydi — test_cases 6-bo'lim).
 */
export function selectLinesByScope(
  lines: readonly SalesLineForCalculation[],
  input: ScopeInput,
): SalesLineForCalculation[] {
  switch (input.scope) {
    case 'OWN':
      return lines.filter((l) => l.employeeId === input.employeeId);
    case 'TEAM': {
      if (!input.teamMemberIds) {
        throw new CalculationError('TEAM_MEMBERS_REQUIRED', "TEAM scope uchun jamoa a'zolari ro'yxati kerak", {
          employeeId: input.employeeId,
        });
      }
      const members = new Set(input.teamMemberIds.filter((id) => id !== input.employeeId));
      return lines.filter((l) => members.has(l.employeeId));
    }
    default:
      throw new CalculationError('INVALID_CONFIGURATION', `Noma'lum scope: ${input.scope}`, {
        scope: input.scope,
      });
  }
}

export interface FactCalculationInput extends ScopeInput {
  filters: readonly RuleFilter[];
  aggregation: string;
  sourceField: string;
}

/**
 * Fakt hisoblash (flowchart J1–J4):
 *   scope bo'yicha qatorlar → qoida filtrlari (AND) → aggregation.
 * `lines` — faqat ACTIVE import versiyasining sales_lines qatorlari bo'lishi shart
 * (buni servis qatlami ta'minlaydi).
 */
export function calculateFact(
  lines: readonly SalesLineForCalculation[],
  input: FactCalculationInput,
): Decimal {
  const scoped = selectLinesByScope(lines, input);
  const matched = applyFilters(scoped, input.filters);
  return aggregate(matched, input.aggregation, input.sourceField);
}
