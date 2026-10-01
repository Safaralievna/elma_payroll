import { aggregate } from './aggregation';
import { CalculationError } from './calculation.errors';
import { periodStartDate, requireIsoDate } from './dates';
import type { Decimal } from './decimal';
import { applyFilters, matchesAllFilters, type RuleFilter } from './filters';
import type { SalesLineForCalculation } from './sales-line.types';

export type KpiScope = 'OWN' | 'TEAM';

export const TEAM_LINK_TYPES = ['SUPERVISOR', 'OPERATOR'] as const;
export type TeamLinkType = (typeof TEAM_LINK_TYPES)[number];

/** ERD v2: team_links qatori. Sanalar "YYYY-MM-DD", endDate = null → hozir ham amalda. */
export interface TeamLink {
  leaderId: string;
  memberId: string;
  linkType: string;
  startDate: string;
  endDate?: string | null;
}

export interface ScopeInput {
  scope: string;
  employeeId: string;
  /**
   * scope = TEAM bo'lsa — rahbarning team_links yozuvlari (tarixi bilan).
   * Servis qatlami davrga tegishli havolalarni beradi; yadro har bir savdo
   * qatorini uning sale_date kunidagi havola bo'yicha tekshiradi.
   */
  teamLinks?: readonly TeamLink[];
  /** kpi_definitions.team_link_type — TEAM scope'da majburiy. */
  teamLinkType?: string | null;
}

function isLinkActiveOn(link: TeamLink, date: string): boolean {
  const start = requireIsoDate(link.startDate, 'team_links.start_date');
  const end = link.endDate === null || link.endDate === undefined ? null : requireIsoDate(link.endDate, 'team_links.end_date');
  return start <= date && (end === null || date <= end);
}

/**
 * OWN  → faqat xodimning o'z savdosi.
 * TEAM → savdo kunida (sale_date) shu rahbarga `teamLinkType` havolasi bilan
 *        bog'langan a'zolarning savdosi. Rahbarning o'z savdosi kirmaydi (DECISIONS 2.4).
 */
export function selectLinesByScope(
  lines: readonly SalesLineForCalculation[],
  input: ScopeInput,
): SalesLineForCalculation[] {
  switch (input.scope) {
    case 'OWN':
      return lines.filter((l) => l.employeeId === input.employeeId);
    case 'TEAM': {
      if (!input.teamLinks) {
        throw new CalculationError('TEAM_MEMBERS_REQUIRED', "TEAM scope uchun jamoa havolalari (team_links) kerak", {
          employeeId: input.employeeId,
        });
      }
      const linkType = input.teamLinkType;
      if (!linkType || !(TEAM_LINK_TYPES as readonly string[]).includes(linkType)) {
        throw new CalculationError('INVALID_CONFIGURATION', "TEAM scope uchun team_link_type noto'g'ri yoki yo'q", {
          teamLinkType: linkType,
        });
      }
      const links = input.teamLinks.filter(
        (l) => l.leaderId === input.employeeId && l.linkType === linkType && l.memberId !== input.employeeId,
      );
      const memberIds = new Set(links.map((l) => l.memberId));
      return lines.filter((line) => {
        if (!memberIds.has(line.employeeId)) return false;
        const saleDate = requireIsoDate(line.saleDate, 'sale_date');
        return links.some((l) => l.memberId === line.employeeId && isLinkActiveOn(l, saleDate));
      });
    }
    default:
      throw new CalculationError('INVALID_CONFIGURATION', `Noma'lum scope: ${input.scope}`, {
        scope: input.scope,
      });
  }
}

export interface PeriodSalesLines {
  /** Joriy davr faktiga kiradigan qatorlar. */
  current: SalesLineForCalculation[];
  /** "O'tgan oylar qaytarishlari" ro'yxati — faktga kirmaydi, faqat ko'rsatiladi. */
  priorPeriodReturns: SalesLineForCalculation[];
}

/**
 * Qaytarishlarni ajratish (DECISIONS 4.1): asl sotuv sanasi (original_sale_date)
 * davr boshidan oldin bo'lgan qatorlar joriy oy faktiga kirmaydi.
 * Servis qatlami faktni faqat `current` dan hisoblaydi.
 */
export function separatePriorPeriodReturns(
  lines: readonly SalesLineForCalculation[],
  period: { year: number; month: number },
): PeriodSalesLines {
  const start = periodStartDate(period.year, period.month);
  const result: PeriodSalesLines = { current: [], priorPeriodReturns: [] };
  for (const line of lines) {
    const original =
      line.originalSaleDate === null || line.originalSaleDate === undefined
        ? null
        : requireIsoDate(line.originalSaleDate, 'original_sale_date');
    if (original !== null && original < start) {
      result.priorPeriodReturns.push(line);
    } else {
      result.current.push(line);
    }
  }
  return result;
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
 * va o'tgan oy qaytarishlari chiqarilgan bo'lishi kerak (separatePriorPeriodReturns).
 */
export function calculateFact(
  lines: readonly SalesLineForCalculation[],
  input: FactCalculationInput,
): Decimal {
  const scoped = selectLinesByScope(lines, input);
  const matched = applyFilters(scoped, input.filters);
  return aggregate(matched, input.aggregation, input.sourceField);
}

/** ERD: kpi_rules qatori (fakt uchun kerakli qismi). */
export interface KpiRuleForFact {
  ruleId: string;
  /** Kichik raqam = birinchi tekshiriladi. */
  priority: number;
  filters: readonly RuleFilter[];
}

export interface KpiRuleFactsInput extends ScopeInput {
  aggregation: string;
  sourceField: string;
  rules: readonly KpiRuleForFact[];
}

export interface KpiRuleFact {
  ruleId: string;
  fact: Decimal;
}

/**
 * Bitta KPI qoidalari bo'yicha faktlar (DECISIONS 2.2):
 * har bir savdo qatori `priority` tartibida birinchi mos kelgan qoidaga tushadi
 * va boshqa qoidalarda hisoblanmaydi. Natija `rules` tartibida qaytadi.
 *
 * Bir xil priority — qaysi qoida birinchi ekani noaniq, shuning uchun xato.
 */
export function calculateKpiRuleFacts(
  lines: readonly SalesLineForCalculation[],
  input: KpiRuleFactsInput,
): KpiRuleFact[] {
  const priorities = new Set<number>();
  const ruleIds = new Set<string>();
  for (const rule of input.rules) {
    if (ruleIds.has(rule.ruleId)) {
      throw new CalculationError('INVALID_CONFIGURATION', 'KPI qoidasi ikki marta berilgan', { ruleId: rule.ruleId });
    }
    ruleIds.add(rule.ruleId);
    if (!Number.isInteger(rule.priority) || priorities.has(rule.priority)) {
      throw new CalculationError('INVALID_CONFIGURATION', "KPI qoidalarining priority qiymatlari butun va har xil bo'lishi kerak", {
        ruleId: rule.ruleId,
        priority: rule.priority,
      });
    }
    priorities.add(rule.priority);
  }

  const ordered = [...input.rules].sort((a, b) => a.priority - b.priority);
  const linesByRule = new Map<string, SalesLineForCalculation[]>(input.rules.map((r) => [r.ruleId, []]));
  for (const line of selectLinesByScope(lines, input)) {
    const rule = ordered.find((r) => matchesAllFilters(line, r.filters));
    if (rule) linesByRule.get(rule.ruleId)!.push(line);
  }

  return input.rules.map((rule) => ({
    ruleId: rule.ruleId,
    fact: aggregate(linesByRule.get(rule.ruleId)!, input.aggregation, input.sourceField),
  }));
}
