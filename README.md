# ELMA — ish haqi va KPI hisoblash tizimi

```
elma-payroll/
├── backend/        NestJS + TypeScript (keyinchalik Prisma + PostgreSQL)
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   └── calculation/          ← 1-bosqich: hisoblash yadrosi (bazasiz, UI'siz)
│   │       ├── decimal.ts            pul arifmetikasi (decimal.js), yaxlitlash
│   │       ├── kpi-engine.ts         KPI qoidasini hisoblash, achievement = fact / plan
│   │       ├── calculators/          STEP, LINEAR, RESULT_PERCENTAGE, PER_UNIT, FIXED, MANUAL
│   │       ├── filters.ts            kpi_rule_filters (=, !=, IN, NOT_IN, >, <, ...)
│   │       ├── aggregation.ts        SUM, COUNT, COUNT_DISTINCT (AKB)
│   │       ├── fact.ts               scope (OWN/TEAM) → filtr → aggregation
│   │       ├── payroll.ts            gross, depozit, net
│   │       ├── import-activation.ts  import versiyalari (ACTIVE/ARCHIVED)
│   │       └── __tests__/            test_cases.json + Excel + chegara holatlari
│   └── test/fixtures/test_cases.json
├── frontend/       (keyinroq) React + TypeScript + Tailwind
└── docs/ERD_TAHLIL.md            ERD/flowchart tahlili va ochiq savollar
```

## Ishga tushirish

Node.js 20 yoki undan yangi versiya kerak.

```bash
cd backend
npm install
npm test          # 48 ta test
npm run typecheck
```

## Ish tartibi (team lead)

1. ✅ Hisoblash yadrosi: STEP, LINEAR, %, dona uchun, depozit, net.
2. ⏳ Prisma sxemasi → import → sales_lines → faktlar.
3. Payroll va depozit (DB bilan).
4. Davr statuslari: OPEN → REVIEW → CLOSED.
5. Interfeys.

## Asosiy qoidalar

- **Pul.** Hisob-kitob faqat `decimal.js` bilan qilinadi, `number` ishlatilmaydi. Oraliq qiymatlar yaxlitlanmaydi, yakuniy summa half-up bilan butun so'mgacha yaxlitlanadi.
- **Formula.** `gross = fixed + kpi + bonus`, `net = gross − penalty − deposit − advance + recalculation`.
- **Depozit.** `(gross − penalty) × deposit_percent`, avans bazaga kirmaydi.
- **Plan.** Faqat STEP va LINEAR'da kerak. Plan ≤ 0 yoki kiritilmagan bo'lsa, `CalculationError` qaytadi, hisob jim o'tkazib yuborilmaydi.
- **Konfiguratsiya.** Pog'onalar, foizlar va stavkalar kodda emas, DB konfiguratsiyasida saqlanadi.
