import { AssignmentPeriod, OverrideRecord, PositionKpiRecord, resolveEmployeeKpis } from '../effective-kpis';

const REP = 'P1';
const SUP = 'P2';

const assignment = (positionId: string, startDate: string, endDate: string | null = null): AssignmentPeriod => ({
  positionId,
  startDate,
  endDate,
});

const positionKpi = (
  positionId: string,
  kpiId: string,
  startDate = '2026-01-01',
  endDate: string | null = null,
  isActive = true,
): PositionKpiRecord => ({ positionId, kpiId, startDate, endDate, isActive });

const override = (
  kpiId: string,
  action: 'ADD' | 'REMOVE',
  startDate = '2026-01-01',
  endDate: string | null = null,
  isActive = true,
): OverrideRecord => ({ kpiId, action, startDate, endDate, isActive });

const POSITION_KPIS = [positionKpi(REP, '10'), positionKpi(REP, '11'), positionKpi(SUP, '20')];

function resolve(
  month: number,
  input: { assignments?: AssignmentPeriod[]; positionKpis?: PositionKpiRecord[]; overrides?: OverrideRecord[] },
) {
  return resolveEmployeeKpis({
    year: 2026,
    month,
    assignments: input.assignments ?? [],
    positionKpis: input.positionKpis ?? POSITION_KPIS,
    overrides: input.overrides ?? [],
  });
}

describe('resolveEmployeeKpis — lavozim KPI\'lari', () => {
  it('oydagi lavozimning KPI\'lari, manbasi POSITION', () => {
    expect(resolve(3, { assignments: [assignment(REP, '2026-01-01')] })).toEqual({
      kpis: [
        { kpiId: '10', source: 'POSITION' },
        { kpiId: '11', source: 'POSITION' },
      ],
      removed: [],
    });
  });

  it("lavozim oy boshida o'zgarsa — har oy o'z lavozimining KPI'lari", () => {
    const assignments = [assignment(REP, '2026-01-01', '2026-02-28'), assignment(SUP, '2026-03-01')];
    expect(resolve(2, { assignments }).kpis.map((k) => k.kpiId)).toEqual(['10', '11']);
    expect(resolve(3, { assignments }).kpis.map((k) => k.kpiId)).toEqual(['20']);
  });

  it("oy o'rtasida ishdan ketgan xodim — shu oyda KPI amalda, keyingi oyda yo'q", () => {
    const assignments = [assignment(REP, '2026-01-01', '2026-03-15')];
    expect(resolve(3, { assignments }).kpis).toHaveLength(2);
    expect(resolve(4, { assignments }).kpis).toEqual([]);
  });

  it('lavozim KPI\'si hali boshlanmagan yoki tugagan oy — hisobga olinmaydi', () => {
    const assignments = [assignment(REP, '2026-01-01')];
    const positionKpis = [positionKpi(REP, '10', '2026-04-01'), positionKpi(REP, '11', '2026-01-01', '2026-02-28')];
    expect(resolve(3, { assignments, positionKpis }).kpis).toEqual([]);
    expect(resolve(4, { assignments, positionKpis }).kpis).toEqual([{ kpiId: '10', source: 'POSITION' }]);
    expect(resolve(2, { assignments, positionKpis }).kpis).toEqual([{ kpiId: '11', source: 'POSITION' }]);
  });

  it('nofaol (is_active = false) yozuvlar e\'tiborga olinmaydi', () => {
    const assignments = [assignment(REP, '2026-01-01')];
    const positionKpis = [positionKpi(REP, '10', '2026-01-01', null, false), positionKpi(REP, '11')];
    expect(resolve(3, { assignments, positionKpis }).kpis).toEqual([{ kpiId: '11', source: 'POSITION' }]);
    const overrides = [override('11', 'REMOVE', '2026-01-01', null, false), override('30', 'ADD', '2026-01-01', null, false)];
    expect(resolve(3, { assignments, positionKpis, overrides }).kpis).toEqual([{ kpiId: '11', source: 'POSITION' }]);
  });

  it("lavozim yo'q va override yo'q — bo'sh", () => {
    expect(resolve(3, {})).toEqual({ kpis: [], removed: [] });
  });
});

describe('resolveEmployeeKpis — override (ADD / REMOVE)', () => {
  const assignments = [assignment(REP, '2026-01-01')];

  it('ADD — qo\'shimcha KPI, manbasi ADD', () => {
    const result = resolve(3, { assignments, overrides: [override('30', 'ADD', '2026-03-01', '2026-03-31')] });
    expect(result.kpis).toEqual([
      { kpiId: '10', source: 'POSITION' },
      { kpiId: '11', source: 'POSITION' },
      { kpiId: '30', source: 'ADD' },
    ]);
    expect(resolve(4, { assignments, overrides: [override('30', 'ADD', '2026-03-01', '2026-03-31')] }).kpis).toHaveLength(2);
  });

  it('lavozimda bor KPI\'ni ADD qilish — KPI bir marta chiqadi', () => {
    expect(resolve(3, { assignments, overrides: [override('10', 'ADD')] }).kpis).toEqual([
      { kpiId: '10', source: 'POSITION' },
      { kpiId: '11', source: 'POSITION' },
    ]);
  });

  it("REMOVE — lavozim KPI'si olib tashlanadi va removed ro'yxatida ko'rinadi", () => {
    const result = resolve(3, { assignments, overrides: [override('11', 'REMOVE', '2026-03-01')] });
    expect(result).toEqual({ kpis: [{ kpiId: '10', source: 'POSITION' }], removed: ['11'] });
    expect(resolve(2, { assignments, overrides: [override('11', 'REMOVE', '2026-03-01')] }).removed).toEqual([]);
  });

  it("xodimda bo'lmagan KPI'ni REMOVE — ta'siri yo'q", () => {
    expect(resolve(3, { assignments, overrides: [override('99', 'REMOVE')] })).toEqual({
      kpis: [
        { kpiId: '10', source: 'POSITION' },
        { kpiId: '11', source: 'POSITION' },
      ],
      removed: [],
    });
  });

  it("lavozimsiz oyda ham ADD amal qiladi", () => {
    expect(resolve(3, { overrides: [override('30', 'ADD')] }).kpis).toEqual([{ kpiId: '30', source: 'ADD' }]);
  });
});
