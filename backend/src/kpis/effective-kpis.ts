import { monthEnd } from '../common/iso-date';

/**
 * Xodimning oydagi amaldagi KPI'lari — toza funksiya (DECISIONS 2.5):
 *
 *   amaldagi = (oydagi lavozim(lar)ning KPI'lari ∪ ADD) − REMOVE
 *
 * Yozuv oyga tegishli = uning [start, end] oralig'i oy bilan kesishadi.
 * `position_kpis` va override'lar oyni butunlay qamraydi (1-kundan oxirgi kungacha),
 * lavozim esa oy o'rtasida tugashi mumkin (ishdan ketish) — shu oyda KPI amalda.
 * Nofaol (is_active = false) yozuvlar e'tiborga olinmaydi.
 *
 * 8-bosqich (hisoblash servisi) shu funksiyani chaqiradi.
 */

interface Dated {
  startDate: string;
  endDate: string | null;
}

export interface AssignmentPeriod extends Dated {
  positionId: string;
}

export interface PositionKpiRecord extends Dated {
  positionId: string;
  kpiId: string;
  isActive: boolean;
}

export interface OverrideRecord extends Dated {
  kpiId: string;
  action: 'ADD' | 'REMOVE';
  isActive: boolean;
}

export type EffectiveKpiSource = 'POSITION' | 'ADD';

export interface EffectiveKpis {
  /** kpiId bo'yicha tartiblangan; lavozimda ham, ADD'da ham bo'lsa — bir marta, POSITION. */
  kpis: { kpiId: string; source: EffectiveKpiSource }[];
  /** REMOVE bilan olib tashlangan (aks holda amalda bo'lardi) KPI'lar. */
  removed: string[];
}

export function resolveEmployeeKpis(input: {
  year: number;
  month: number;
  assignments: readonly AssignmentPeriod[];
  positionKpis: readonly PositionKpiRecord[];
  overrides: readonly OverrideRecord[];
}): EffectiveKpis {
  const first = `${input.year}-${String(input.month).padStart(2, '0')}-01`;
  const last = monthEnd(input.year, input.month);
  const inMonth = (record: Dated) => record.startDate <= last && (record.endDate === null || record.endDate >= first);

  const positions = new Set(input.assignments.filter(inMonth).map((assignment) => assignment.positionId));
  const sources = new Map<string, EffectiveKpiSource>();
  for (const link of input.positionKpis) {
    if (link.isActive && inMonth(link) && positions.has(link.positionId)) sources.set(link.kpiId, 'POSITION');
  }

  const overrides = input.overrides.filter((override) => override.isActive && inMonth(override));
  for (const override of overrides) {
    if (override.action === 'ADD' && !sources.has(override.kpiId)) sources.set(override.kpiId, 'ADD');
  }
  const removed: string[] = [];
  for (const override of overrides) {
    if (override.action === 'REMOVE' && sources.delete(override.kpiId)) removed.push(override.kpiId);
  }

  return {
    kpis: [...sources].map(([kpiId, source]) => ({ kpiId, source })).sort((a, b) => compareIds(a.kpiId, b.kpiId)),
    removed: removed.sort(compareIds),
  };
}

/** DB id'lari (satr) — son sifatida tartiblanadi. */
function compareIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
