# Ish rejasi

Holat belgilari: ✅ tayyor · 🔄 jarayonda · ⏳ navbatda

Har bir bosqich oxirida: `npm test` va `npm run typecheck` xatosiz, so'ng git commit.

| # | Bosqich | Holat |
|---|---------|-------|
| 1 | Hisoblash yadrosi (STEP, LINEAR, %, dona uchun, depozit, net) + `test_cases.json` | ✅ |
| 1.1 | Yadroni yangi qarorlarga moslash (`docs/DECISIONS.md` 1–3) | ⏳ |
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

## 1.1 — Yadroni yangi qarorlarga moslash

1. **Yaxlitlash:** har bir qoida natijasi butun so'mgacha yaxlitlanadi; KPI = yaxlitlangan qoidalar yig'indisi. `excel-reference.spec.ts`: KPI jami 2 325 297, ish haqi 4 565 297.
2. **Priority:** bitta KPI ichida savdo qatori faqat `priority` bo'yicha birinchi mos kelgan qoidaga tushadi. Yangi funksiya: KPI qoidalari ro'yxati + qatorlar → har qoidaning fakti.
3. **FIXED:** `min_achievement` bo'lsa — plan kerak, bajarilish ≥ min_achievement bo'lsa `amount`, aks holda 0. `requiresPlan` konfiguratsiyaga bog'liq bo'ladi.
4. **Qaytarishlar:** manfiy `amount`/`quantity` qabul qilinadi; AKB = sof summasi > 0 bo'lgan mijozlar soni (yangi aggregation, masalan `COUNT_DISTINCT_POSITIVE`); `original_sale_date` o'tgan oyda bo'lgan qatorlar faktdan chiqariladi.
5. **TEAM:** jamoa sale_date bo'yicha aniqlanadi — yadro `team_links` ro'yxatini (leader, member, link_type, start, end) qabul qilib, har qatorni savdo kunidagi havola bo'yicha tekshiradi.
6. **Payroll:** `debtCarryover`, `depositReturn` kirishlari; `payable = max(net, 0)`, `newDebt = net < 0 ? −net : 0`.
7. **Depozit balansi:** `validateDepositWithdrawal(balance, amount)` — balansdan ko'p yechib bo'lmaydi.
8. Har bir o'zgarish uchun testlar. Eski `test_cases.json` testlari o'tishda davom etishi shart.
