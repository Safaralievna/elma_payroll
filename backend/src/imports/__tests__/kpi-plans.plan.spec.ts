import { Decimal } from '../../calculation/decimal';
import { planKey, planShapeFor, PlanValues } from '../../kpi-plans/plan-rules';
import { SheetRow } from '../excel/sheet';
import { KpiPlanImportContext, planKpiPlanRows } from '../plans/kpi-plans.plan';

function rows(...values: Record<string, unknown>[]): SheetRow[] {
  return values.map((value, index) => ({ rowNumber: index + 2, values: value as SheetRow['values'] }));
}

const dec = (value: string | null) => (value === null ? null : new Decimal(value));
const values = (planValue: string | null, baseAmount: string | null, manualAmount: string | null = null): PlanValues => ({
  planValue: dec(planValue),
  baseAmount: dec(baseAmount),
  manualAmount: dec(manualAmount),
});

/** E001 (id 1) va E002 (id 2); KPI'lar: SAVDO (STEP), QOLDA (MANUAL), SALFETKA (PER_UNIT), ESKI (nofaol STEP). */
function context(overrides: Partial<KpiPlanImportContext> = {}): KpiPlanImportContext {
  return {
    employees: new Map([
      ['E001', { id: 1n }],
      ['E002', { id: 2n }],
    ]),
    kpis: new Map([
      ['SAVDO', { id: 10n, isActive: true, calculationType: 'STEP', shape: planShapeFor('STEP', [{}]) }],
      ['QOLDA', { id: 11n, isActive: true, calculationType: 'MANUAL', shape: planShapeFor('MANUAL', [{}]) }],
      ['SALFETKA', { id: 12n, isActive: true, calculationType: 'PER_UNIT', shape: planShapeFor('PER_UNIT', [{ rate_per_unit: 1 }]) }],
      ['ESKI', { id: 13n, isActive: false, calculationType: 'STEP', shape: planShapeFor('STEP', [{}]) }],
    ]),
    assigned: new Set([planKey(1n, 10n), planKey(1n, 11n), planKey(1n, 12n), planKey(1n, 13n), planKey(2n, 10n)]),
    existing: new Map(),
    ...overrides,
  };
}

describe('planKpiPlanRows — PLANS importi', () => {
  it('yangi plan — CREATED; mavjud plan boshqa qiymat bilan — UPDATED; bir xil son — UNCHANGED', () => {
    const ctx = context({
      existing: new Map([
        [planKey(1n, 11n), { id: 500n, values: values(null, null, '100000') }],
        [planKey(2n, 10n), { id: 501n, values: values('1000', '500000') }],
      ]),
    });
    const result = planKpiPlanRows(
      rows(
        { xodim_kodi: 'E001', kpi_kodi: 'SAVDO', plan: 150000000, baza_summa: '1 500 000' },
        { xodim_kodi: 'E001', kpi_kodi: 'QOLDA', qolda_summa: 250000 },
        { xodim_kodi: 'E002', kpi_kodi: 'SAVDO', plan: '1000.0000', baza_summa: 500000 },
      ),
      ctx,
    );

    expect(result.outcomes.map((outcome) => [outcome.rowNumber, outcome.employeeCode, outcome.outcome, outcome.errors])).toEqual([
      [2, 'E001', 'CREATED', []],
      [3, 'E001', 'UPDATED', []],
      [4, 'E002', 'UNCHANGED', []],
    ]);
    expect(result.changes).toHaveLength(2);
    const [created, updated] = result.changes;
    expect(created).toMatchObject({ kind: 'CREATE', employeeId: 1n, kpiId: 10n, existingId: null, before: null });
    expect(created!.values.planValue?.toString()).toBe('150000000');
    expect(created!.values.baseAmount?.toString()).toBe('1500000');
    expect(created!.values.manualAmount).toBeNull();
    expect(updated).toMatchObject({ kind: 'UPDATE', employeeId: 1n, kpiId: 11n, existingId: 500n });
    expect(updated!.before?.manualAmount?.toString()).toBe('100000');
    expect(updated!.values.manualAmount?.toString()).toBe('250000');
  });

  it('noma\'lum xodim, noma\'lum va nofaol KPI — xato', () => {
    const result = planKpiPlanRows(
      rows(
        { xodim_kodi: 'E999', kpi_kodi: 'SAVDO', plan: 100, baza_summa: 1 },
        { xodim_kodi: 'E001', kpi_kodi: 'YOQ', plan: 100, baza_summa: 1 },
        { xodim_kodi: 'E001', kpi_kodi: 'ESKI', plan: 100, baza_summa: 1 },
      ),
      context(),
    );
    expect(result.outcomes.map((outcome) => outcome.errors)).toEqual([
      [{ field: 'xodim_kodi', message: 'Xodim topilmadi: E999' }],
      [{ field: 'kpi_kodi', message: 'KPI topilmadi: YOQ' }],
      [{ field: 'kpi_kodi', message: 'KPI nofaol: ESKI' }],
    ]);
    expect(result.changes).toEqual([]);
  });

  it('KPI shu oy xodimga biriktirilmagan — KPI_NOT_ASSIGNED xabari', () => {
    const result = planKpiPlanRows(rows({ xodim_kodi: 'E002', kpi_kodi: 'QOLDA', qolda_summa: 1 }), context());
    expect(result.outcomes[0]!.errors).toEqual([
      { field: 'kpi_kodi', message: 'QOLDA KPI shu oyda E002 xodimga biriktirilmagan' },
    ]);
  });

  it('plansiz turdagi KPI — plan kiritilmaydi', () => {
    const result = planKpiPlanRows(rows({ xodim_kodi: 'E001', kpi_kodi: 'SALFETKA', plan: 100 }), context());
    expect(result.outcomes[0]!.errors).toEqual([
      { field: 'kpi_kodi', message: 'SALFETKA KPI turi (PER_UNIT) uchun plan kiritilmaydi' },
    ]);
  });

  it('bo\'sh majburiy katakcha, ortiqcha katakcha va noto\'g\'ri son — ustun nomi bilan', () => {
    const result = planKpiPlanRows(
      rows(
        { xodim_kodi: 'E001', kpi_kodi: 'SAVDO', plan: null, baza_summa: 100, qolda_summa: 5 },
        { xodim_kodi: 'E002', kpi_kodi: 'SAVDO', plan: 0, baza_summa: 'ko\'p' },
      ),
      context(),
    );
    expect(result.outcomes[0]!.errors).toEqual([
      { field: 'plan', message: "To'ldirilishi majburiy" },
      { field: 'qolda_summa', message: expect.stringContaining('kiritilmaydi') },
    ]);
    expect(result.outcomes[1]!.errors).toEqual([
      { field: 'plan', message: "0 dan katta bo'lishi kerak" },
      { field: 'baza_summa', message: "Son bo'lishi kerak" },
    ]);
  });

  it('fayl ichida bir xil xodim + KPI ikki marta — ikkala qatorga xato', () => {
    const result = planKpiPlanRows(
      rows(
        { xodim_kodi: 'E001', kpi_kodi: 'SAVDO', plan: 100, baza_summa: 1 },
        { xodim_kodi: 'E002', kpi_kodi: 'SAVDO', plan: 100, baza_summa: 1 },
        { xodim_kodi: 'E001', kpi_kodi: 'SAVDO', plan: 200, baza_summa: 1 },
      ),
      context(),
    );
    expect(result.outcomes.map((outcome) => outcome.errors)).toEqual([
      [{ field: 'kpi_kodi', message: 'Fayl ichida takrorlangan: E001 + SAVDO (2, 4-qatorlar)' }],
      [],
      [{ field: 'kpi_kodi', message: 'Fayl ichida takrorlangan: E001 + SAVDO (2, 4-qatorlar)' }],
    ]);
  });
});
