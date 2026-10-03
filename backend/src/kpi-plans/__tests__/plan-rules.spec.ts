import { Decimal } from '../../calculation/decimal';
import {
  checkPlanFields,
  findMissingPlans,
  planKey,
  planShapeFor,
  PlanValues,
  samePlanValues,
  validatePlanValues,
} from '../plan-rules';

const STEP_CONFIG = {};
const values = (planValue: string | null, baseAmount: string | null, manualAmount: string | null = null): PlanValues => ({
  planValue: planValue === null ? null : new Decimal(planValue),
  baseAmount: baseAmount === null ? null : new Decimal(baseAmount),
  manualAmount: manualAmount === null ? null : new Decimal(manualAmount),
});

describe('planShapeFor — KPI turi bo\'yicha qaysi maydon majburiy (DECISIONS 2.1)', () => {
  it('STEP va LINEAR: plan va baza summa majburiy', () => {
    expect(planShapeFor('STEP', [STEP_CONFIG])).toEqual({ applicable: true, required: ['planValue', 'baseAmount'] });
    expect(planShapeFor('LINEAR', [{ min_percent: 50 }])).toEqual({ applicable: true, required: ['planValue', 'baseAmount'] });
  });

  it('min_achievement\'li FIXED: faqat plan (summa qoida konfiguratsiyasida)', () => {
    expect(planShapeFor('FIXED', [{ min_achievement: 100, amount: 500000 }])).toEqual({ applicable: true, required: ['planValue'] });
  });

  it('MANUAL: faqat qo\'lda kiritilgan summa', () => {
    expect(planShapeFor('MANUAL', [{}])).toEqual({ applicable: true, required: ['manualAmount'] });
    expect(planShapeFor('MANUAL', [])).toEqual({ applicable: true, required: ['manualAmount'] });
  });

  it('plansiz turlar: RESULT_PERCENTAGE, PER_UNIT, shartsiz FIXED — plan kiritilmaydi', () => {
    expect(planShapeFor('RESULT_PERCENTAGE', [{ percent: 3 }, { percent: 2 }])).toEqual({ applicable: false });
    expect(planShapeFor('PER_UNIT', [{ rate_per_unit: 1000 }])).toEqual({ applicable: false });
    expect(planShapeFor('FIXED', [{ amount: 500000 }])).toEqual({ applicable: false });
  });

  it('faol qoidasi yo\'q FIXED — shart noma\'lum, plan kiritilmaydi; STEP turi o\'zi plan talab qiladi', () => {
    expect(planShapeFor('FIXED', [])).toEqual({ applicable: false });
    expect(planShapeFor('STEP', [])).toEqual({ applicable: true, required: ['planValue', 'baseAmount'] });
  });
});

describe('checkPlanFields — majburiy va ortiqcha maydonlar', () => {
  const step = { applicable: true as const, required: ['planValue' as const, 'baseAmount' as const] };

  it('hammasi joyida — xato yo\'q', () => {
    expect(checkPlanFields(step, ['planValue', 'baseAmount'])).toEqual([]);
  });

  it('majburiy maydon yo\'q — har biri uchun xato', () => {
    expect(checkPlanFields(step, [])).toEqual([
      { field: 'planValue', message: "To'ldirilishi majburiy" },
      { field: 'baseAmount', message: "To'ldirilishi majburiy" },
    ]);
  });

  it('bu tur uchun kiritilmaydigan maydon — xato', () => {
    expect(checkPlanFields(step, ['planValue', 'baseAmount', 'manualAmount'])).toEqual([
      { field: 'manualAmount', message: expect.stringContaining('kiritilmaydi') },
    ]);
  });
});

describe('validatePlanValues — maydonlar va son chegaralari birga', () => {
  const step = planShapeFor('STEP', [STEP_CONFIG]);
  const manual = planShapeFor('MANUAL', [{}]);
  if (!step.applicable || !manual.applicable) throw new Error('shakl kutilmagan');

  it('to\'g\'ri STEP plani; baza summa 0 ruxsat', () => {
    expect(validatePlanValues(step, values('150000000.5', '1500000'))).toEqual([]);
    expect(validatePlanValues(step, values('1', '0'))).toEqual([]);
  });

  it('plan 0 yoki manfiy — xato (0 ga bo\'linmaydi)', () => {
    expect(validatePlanValues(step, values('0', '100'))).toEqual([{ field: 'planValue', message: "0 dan katta bo'lishi kerak" }]);
    expect(validatePlanValues(step, values('-5', '100'))).toEqual([{ field: 'planValue', message: "0 dan katta bo'lishi kerak" }]);
  });

  it('manfiy summa va ortiqcha kasr — jim yaxlitlanmaydi, xato', () => {
    expect(validatePlanValues(step, values('100.12345', '-1'))).toEqual([
      { field: 'planValue', message: "Ko'pi bilan 4 kasr belgisi bo'lishi mumkin" },
      { field: 'baseAmount', message: "Manfiy bo'lmasligi kerak" },
    ]);
    expect(validatePlanValues(step, values('100', '10.005'))).toEqual([
      { field: 'baseAmount', message: "Ko'pi bilan 2 kasr belgisi bo'lishi mumkin" },
    ]);
  });

  it('DB ustuniga sig\'maydigan son — xato: plan decimal(18,4), summa decimal(18,2)', () => {
    expect(validatePlanValues(step, values('99999999999999.9999', '9999999999999999.99'))).toEqual([]);
    expect(validatePlanValues(step, values('100000000000000', '10000000000000000'))).toEqual([
      { field: 'planValue', message: 'Son juda katta' },
      { field: 'baseAmount', message: 'Son juda katta' },
    ]);
  });

  it('MANUAL: summasiz — xato; plan berilsa — xato', () => {
    expect(validatePlanValues(manual, values(null, null, null))).toEqual([{ field: 'manualAmount', message: "To'ldirilishi majburiy" }]);
    expect(validatePlanValues(manual, values('100', null, '500000'))).toEqual([
      { field: 'planValue', message: expect.stringContaining('kiritilmaydi') },
    ]);
    expect(validatePlanValues(manual, values(null, null, '0'))).toEqual([]);
  });
});

describe('samePlanValues — Decimal bilan solishtirish', () => {
  it('"100" va "100.0000" — bir xil son', () => {
    expect(samePlanValues(values('100', '1500000'), values('100.0000', '1500000.00'))).toBe(true);
  });

  it('qiymat yoki bo\'sh/to\'liq farqi — har xil', () => {
    expect(samePlanValues(values('100', '1500000'), values('100.0001', '1500000'))).toBe(false);
    expect(samePlanValues(values('100', null), values('100', '0'))).toBe(false);
  });
});

describe('findMissingPlans — plan talab qiladigan, lekin kiritilmagan KPI\'lar', () => {
  const step = planShapeFor('STEP', [STEP_CONFIG]);
  const manual = planShapeFor('MANUAL', [{}]);
  const perUnit = planShapeFor('PER_UNIT', [{ rate_per_unit: 1000 }]);

  it('plan yozuvi yo\'q — hamma majburiy maydon yetishmaydi; plansiz tur ro\'yxatga kirmaydi', () => {
    const missing = findMissingPlans(
      [
        { employeeId: '1', kpiId: '10', shape: step },
        { employeeId: '1', kpiId: '11', shape: perUnit },
        { employeeId: '2', kpiId: '12', shape: manual },
      ],
      new Map(),
    );
    expect(missing).toEqual([
      { employeeId: '1', kpiId: '10', missing: ['planValue', 'baseAmount'] },
      { employeeId: '2', kpiId: '12', missing: ['manualAmount'] },
    ]);
  });

  it('to\'liq plan — ro\'yxatda yo\'q; MANUAL yozuvi bor-u summasi bo\'sh — ro\'yxatda', () => {
    const plans = new Map([
      [planKey('1', '10'), values('100', '1500000')],
      [planKey('2', '12'), values(null, null, null)],
    ]);
    expect(
      findMissingPlans(
        [
          { employeeId: '1', kpiId: '10', shape: step },
          { employeeId: '2', kpiId: '12', shape: manual },
        ],
        plans,
      ),
    ).toEqual([{ employeeId: '2', kpiId: '12', missing: ['manualAmount'] }]);
  });
});
