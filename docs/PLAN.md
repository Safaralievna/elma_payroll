# Ish rejasi

Holat belgilari: ✅ tayyor · 🔄 jarayonda · ⏳ navbatda

Har bir bosqich oxirida: `npm test` va `npm run typecheck` xatosiz, so'ng git commit.

| # | Bosqich | Holat |
|---|---------|-------|
| 1 | Hisoblash yadrosi (STEP, LINEAR, %, dona uchun, depozit, net) + `test_cases.json` | ✅ |
| 1.1 | Yadroni yangi qarorlarga moslash (`docs/DECISIONS.md` 1–3) | ✅ |
| 2 | ERD v2 → Prisma sxemasi, Docker'da PostgreSQL, migratsiya + qo'lda SQL cheklovlar, seed | ⏳ |
| 3 | Auth (JWT, argon2), rollar ADMIN/CALCULATOR/APPROVER, audit servisi | ⏳ |
| 4 | Ma'lumotnomalar, xodimlar, lavozim tarixi, maosh tarixi, team_links (CRUD + Excel import) | ⏳ |
| 5 | KPI konstruktor: KPI, qoidalar, pog'onalar, filtrlar, lavozimga biriktirish, override | ⏳ |
| 6 | Plan: qo'lda va Excel'dan | ⏳ |
| 7 | Savdo importi: validatsiya, versiyalar, file_hash, OPEN/CLOSED rejimlari, "nima o'zgardi", o'tgan oy qaytarishlari | ⏳ |
| 8 | Hisoblash servisi: faktlar → KPI natijalari → payroll (bonus, jarima, avans, depozit, qarz, qayta hisob) | ⏳ |
| 9 | Davr: OPEN → REVIEW → CLOSED, ikki kishi qoidasi, CLOSED himoyasi | ⏳ |
| 10 | Depozitdan yechish, to'lovlar (karta/naqd), Vedomost va Talabnoma (Excel) | ⏳ |
| 11 | Frontend: React + Tailwind, oddiy jadval va formalar | ⏳ |
| 12 | Docker bilan ishga tushirish, Excel bilan parallel sinov | ⏳ |

---

## 1.1 — Yadroni yangi qarorlarga moslash ✅

Natija: 79 test o'tdi, typecheck xatosiz. Yangi testlar — `src/calculation/__tests__/decisions-v2.spec.ts`.
Yangi funksiyalar: `calculateKpiRuleFacts`, `separatePriorPeriodReturns`, `calculateDepositBalance`, `validateDepositWithdrawal`; aggregation `COUNT_DISTINCT_POSITIVE`.

1. **Yaxlitlash:** har bir qoida natijasi butun so'mgacha yaxlitlanadi; KPI = yaxlitlangan qoidalar yig'indisi. `excel-reference.spec.ts`: KPI jami 2 325 297, ish haqi 4 565 297.
2. **Priority:** bitta KPI ichida savdo qatori faqat `priority` bo'yicha birinchi mos kelgan qoidaga tushadi. Yangi funksiya: KPI qoidalari ro'yxati + qatorlar → har qoidaning fakti.
3. **FIXED:** `min_achievement` bo'lsa — plan kerak, bajarilish ≥ min_achievement bo'lsa `amount`, aks holda 0. `requiresPlan` konfiguratsiyaga bog'liq bo'ladi.
4. **Qaytarishlar:** manfiy `amount`/`quantity` qabul qilinadi; AKB = sof summasi > 0 bo'lgan mijozlar soni (yangi aggregation, masalan `COUNT_DISTINCT_POSITIVE`); `original_sale_date` o'tgan oyda bo'lgan qatorlar faktdan chiqariladi.
5. **TEAM:** jamoa sale_date bo'yicha aniqlanadi — yadro `team_links` ro'yxatini (leader, member, link_type, start, end) qabul qilib, har qatorni savdo kunidagi havola bo'yicha tekshiradi.
6. **Payroll:** `debtCarryover`, `depositReturn` kirishlari; `payable = max(net, 0)`, `newDebt = net < 0 ? −net : 0`.
7. **Depozit balansi:** `validateDepositWithdrawal(balance, amount)` — balansdan ko'p yechib bo'lmaydi.
8. Har bir o'zgarish uchun testlar. Eski `test_cases.json` testlari o'tishda davom etishi shart.

---

## 2-bosqich — Baza: ERD v2 → Prisma

Manba: `docs/ERD_v2.dbml` (41 jadval). Undan chetga chiqilmaydi.

1. `docker-compose.yml` (loyiha ildizida): PostgreSQL 16, ma'lumot volume'da saqlanadi.
2. `backend/prisma/schema.prisma`: ERD v2 dagi hamma jadval. Model nomlari PascalCase, ustunlar camelCase + `@map`, jadvallar `@@map("snake_case")`. `employees.employee_id` → `employeeCode`.
3. Migratsiya 1 (`init`): Prisma generatsiya qiladi.
4. Migratsiya 2 (`constraints`): ERD v2 dagi hamma `// CHECK:`, `EXCLUDE USING gist` (`CREATE EXTENSION btree_gist`), partial/`NULLS NOT DISTINCT` unique indekslar, `audit_logs` uchun UPDATE/DELETE'ni to'suvchi trigger — qo'lda SQL.
5. `backend/src/prisma/`: PrismaService + PrismaModule (minimal).
6. `backend/prisma/seed.ts` (idempotent — qayta ishga tushsa dublikat yaratmaydi):
   - rollar ADMIN, CALCULATOR, APPROVER; admin foydalanuvchi (parol `.env` dagi `SEED_ADMIN_PASSWORD`, argon2);
   - 4 lavozim: Savdo vakili, Supervayzer, Operator, Yetkazib berish (Ekspeditor, `deposit_percent = 10`);
   - kpi_units: UZS, DONA, AKB; price_types: ULGURJI, CHAKANA;
   - namuna KPI: "Umumiy savdo hajmi" (STEP, SUM amount, OWN) — Excel'dagi 4 pog'ona bilan, Savdo vakili lavozimiga biriktirilgan.
7. `backend/.env.example`; `.env` gitignore'da.
8. DB testlari (`npm run test:db`, alohida jest config): har bir muhim cheklov haqiqatan ishlashini tekshiradi (ikkinchi ACTIVE batch, ustma-ust tarix, audit_logs'ni o'chirish, manfiy jarima, noto'g'ri status ...). `npm test` avvalgidek DB'siz qoladi.
9. `README.md` ni yangila (ishga tushirish: `docker compose up -d`, migratsiya, seed). `*.tsbuildinfo` ni `.gitignore` ga qo'sh va git'dan chiqar.
