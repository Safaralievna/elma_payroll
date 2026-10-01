/**
 * Kompaniyaning ishlayotgan Excel fayli ("Торговый представитель" varag'i)
 * bilan to'liq solishtirish. Hamma 17 ta STEP qatori + 1% tashkilotlar qatori.
 */
import { Decimal, calculateKpiRule, calculatePayroll, roundMoney, sumDecimals, type StepTierInput } from '..';

const EXCEL_STEPS: StepTierInput[] = [
  { minPercent: 70, maxPercent: 80, coefficient: 2, maxRewardPercent: 20 },
  { minPercent: 80, maxPercent: 90, coefficient: 3, maxRewardPercent: 30 },
  { minPercent: 90, maxPercent: 100, coefficient: 5, maxRewardPercent: 50 },
  { minPercent: 100, maxPercent: 150, coefficient: 1, maxRewardPercent: 50 },
];

// [plan, fakt, baza, Excel G ustunidagi natija]
const SALES_REP_ROWS: [number, number, number, string][] = [
  [1_450_000, 1_171_000, 2_000_000, '445517.24'],
  [400_000, 300_000, 200_000, '20000'],
  [600_000, 600_000, 200_000, '200000'],
  [200_000, 21_000, 200_000, '0'],
  [140_000, 140_000, 200_000, '200000'],
  [110_000, 110_000, 200_000, '200000'],
  [440, 520, 100_000, '118181.82'],
  [300, 210, 100_000, '0'],
  [950, 960, 100_000, '101052.63'],
  [117, 128, 100_000, '109401.71'],
  [200, 230, 100_000, '115000'],
  [40, 30, 100_000, '10000'],
  [20, 30, 100_000, '150000'],
  [70, 60, 100_000, '37142.86'],
  [50, 51, 200_000, '204000'],
  [50, 49, 200_000, '180000'],
  [100_000, 95_000, 300_000, '225000'],
];

function calculateRows() {
  const stepAmounts = SALES_REP_ROWS.map(([plan, fact, base]) =>
    calculateKpiRule({ calculationType: 'STEP', plan, fact, baseAmount: base, steps: EXCEL_STEPS }).amount,
  );
  const organizations = calculateKpiRule({
    calculationType: 'RESULT_PERCENTAGE',
    fact: 1_000_000,
    configuration: { percent: 1 },
  }).amount;
  return { stepAmounts, organizations };
}

describe('Excel: Savdo vakili varag\'i', () => {
  it('har bir qator Excel bilan tiyingacha mos', () => {
    const { stepAmounts } = calculateRows();
    stepAmounts.forEach((amount, i) => {
      expect(amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()).toBe(
        new Decimal(SALES_REP_ROWS[i][3]).toString(),
      );
    });
  });

  it('KPI jami (aniq) = 2 325 296.26, yakuniy ish haqi = 4 565 296', () => {
    const { stepAmounts, organizations } = calculateRows();
    const kpiExact = sumDecimals([...stepAmounts, organizations]);
    expect(kpiExact.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString()).toBe('2325296.26');

    const payroll = calculatePayroll({
      fixedSalary: 2_000_000,
      kpiTotal: roundMoney(kpiExact),
      bonusTotal: 500_000,
      penaltyTotal: 260_000,
      advanceTotal: 0,
      recalculationAmount: 0,
      depositPercent: null, // savdo vakilida depozit yo'q
    });
    expect(payroll.netAmount.toNumber()).toBe(4_565_296);
  });

  it('OCHIQ SAVOL: har qatorni alohida yaxlitlasak jami 1 so\'mga farq qiladi', () => {
    const { stepAmounts, organizations } = calculateRows();
    const perRowRounded = sumDecimals([...stepAmounts, organizations].map(roundMoney));
    // Excel: 2 325 296. Qator bo'yicha yaxlitlash: 2 325 297.
    expect(perRowRounded.toNumber()).toBe(2_325_297);
  });
});
