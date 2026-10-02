# Ish rejasi

Holat belgilari: ✅ tayyor · 🔄 jarayonda · ⏳ navbatda

Har bir bosqich oxirida: `npm test` va `npm run typecheck` xatosiz, so'ng git commit.

| # | Bosqich | Holat |
|---|---------|-------|
| 1 | Hisoblash yadrosi (STEP, LINEAR, %, dona uchun, depozit, net) + `test_cases.json` | ✅ |
| 1.1 | Yadroni yangi qarorlarga moslash (`docs/DECISIONS.md` 1–3) | ✅ |
| 2 | ERD v2 → Prisma sxemasi, Docker'da PostgreSQL, migratsiya + qo'lda SQL cheklovlar, seed | ✅ |
| 3 | Auth (JWT, argon2), rollar ADMIN/CALCULATOR/APPROVER, audit servisi | ✅ |
| 4 | Ma'lumotnomalar, xodimlar, lavozim tarixi, maosh tarixi, team_links (CRUD + Excel import) | ✅ |
| 5 | KPI konstruktor: KPI, qoidalar, pog'onalar, filtrlar, lavozimga biriktirish, override | ✅ |
| 6 | Plan: qo'lda va Excel'dan | ⏳ |
| 7 | Savdo importi: validatsiya, versiyalar, file_hash, OPEN/CLOSED rejimlari, "nima o'zgardi", o'tgan oy qaytarishlari | ⏳ |
| 8 | Hisoblash servisi: faktlar → KPI natijalari → payroll (bonus, jarima, avans, depozit, qarz, qayta hisob) | ⏳ |
| 9 | Davr: OPEN → REVIEW → CLOSED, ikki kishi qoidasi, CLOSED himoyasi | ⏳ |
| 10 | Depozitdan yechish, to'lovlar (karta/naqd), Vedomost va Talabnoma (Excel) | ⏳ |
| 11 | Frontend: React + Tailwind, oddiy jadval va formalar (team lead dizayn tizimi bo'yicha) | ⏳ |
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

## 2-bosqich — Baza: ERD v2 → Prisma ✅

Natija: `npm test` 79/79, `npm run typecheck` xatosiz, `npm run test:db` 30/30, `npm run db:check-drift` — "No difference detected".
Prisma 7.10.0 (driver adapter `@prisma/adapter-pg`). Docker bazasi — port **5433** (5432 band edi).
`import_batches`: uchala unique indeks `NULLS NOT DISTINCT`; `version_key` va `file_hash_key` `schema.prisma` da ham `@@unique(map:)` bilan e'lon qilingan — aks holda Prisma ularni o'chirishga urinadi.

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

---

## 3-bosqich — Auth, rollar, audit ✅

Natija: `npm test` 143/143, `npm run typecheck` xatosiz, `npm run test:db` 55/55 (shundan E2E 25), `npm run db:check-drift` — "No difference detected".

Tasdiqlangan qarorlar (2026-10-01):
- Token 8 soat (`JWT_EXPIRES_IN`), refresh token yo'q. `JWT_SECRET` < 32 belgi → server ishga tushmaydi.
- ADMIN faqat foydalanuvchilar/sozlamalar/auditni boshqaradi; hisoblash va tasdiqlash uchun alohida rol kerak.
- Login urinishlari auditga (`LOGIN_SUCCESS`, `LOGIN_FAILED` + sabab: `UNKNOWN_USER` / `WRONG_PASSWORD` / `USER_INACTIVE`).
- `/auth/login`: IP bo'yicha daqiqasiga 5 urinish (`@nestjs/throttler`), oshsa 429 `TOO_MANY_ATTEMPTS`.
- Foydalanuvchi topilmasa ham `argon2.verify` soxta xesh bilan chaqiriladi (javob vaqti teng).
- Auditni ADMIN va APPROVER ko'radi. Oxirgi faol ADMIN'ni bloklash/ADMIN rolini olish — 409 `LAST_ADMIN`.
- Parol: 8–128 belgi.

Amalga oshirildi:
1. `src/common/`: `AppError` + global `AllExceptionsFilter` — javob doim `{ code, message, details? }`; `ZodValidationPipe`, `idParamSchema`.
2. `src/auth/`: global `JwtAuthGuard` (token → foydalanuvchi va rollar har so'rovda bazadan; bloklansa/rol olinsa darhol kuchga kiradi) va `RolesGuard`; `@Public()`, `@Roles()`, `@CurrentUser()`; `LoginThrottlerGuard`.
3. `src/users/`: CRUD (o'chirish yo'q — bloklash), `reset-password`, `/roles`. Xodimga bog'lash faqat `employeeCode` orqali. LAST_ADMIN tekshiruvi faol adminlarni `FOR UPDATE` bilan qulflab bajariladi.
4. `src/audit/`: `AuditService.log(tx, ...)` — asosiy o'zgarish bilan bitta tranzaksiyada; `sanitizeForAudit` parol/token maydonlarini olib tashlaydi, BigInt/Decimal/Date → satr. `GET /audit-logs` filtrlar va sahifalash bilan.
5. E2E testlar alohida `elma_payroll_test_e2e` bazasida (audit_logs o'chirilmagani uchun rollback testlariga ta'sir qilmasligi kerak).
6. `@nestjs/jwt` 11 (12-versiya faqat ESM — Jest/CommonJS bilan ishlamaydi).
7. `tsconfig.build.json`: `incremental: false` — eski `.tsbuildinfo` sababli `nest build` ba'zi `.js` fayllarni chiqarmay qo'yayotgan edi.

8. Token parol bilan bog'langan (2026-10-02): JWT payload'ida `pwd` — `sha256(passwordHash)` ning birinchi 16 belgisi (`src/auth/password-fingerprint.ts`). `JwtAuthGuard` bazadagi joriy xeshdan izni hisoblab solishtiradi; mos kelmasa (yoki `pwd` yo'q bo'lsa) — 401 `UNAUTHORIZED`. Parol almashtirilsa (`change-password`) yoki tiklansa (`reset-password`), eski tokenlar darhol ishlamaydi — o'z parolini almashtirgan foydalanuvchi ham qaytadan login qiladi. ERD o'zgarmadi (alohida token versiyasi ustuni kerak bo'lmadi). Bloklash ham darhol ishlaydi.

---

## 4-bosqich — Ma'lumotnomalar, xodimlar, tarix, team_links, import ✅

Natija: `npm test` 205/205, `npm run typecheck` xatosiz, `npm run test:db` 90/90 (shundan 4-bosqich E2E 35), `npm run db:check-drift` — "No difference detected".
Tasdiqlangan qarorlar — `docs/DECISIONS.md` 4.0 va 4.0.1; ochiq savol (oy o'rtasidagi fiks oylik) — 7-bo'lim.

1. **Ma'lumotnomalar** (`src/reference/`): departments, positions (`depositPercent`), product-groups, products, client-categories, clients, price-types — bitta konfiguratsiya (`reference.resources.ts`) + umumiy servis/kontroller. GET (filtr `search`, `isActive`, sahifalash), POST, PATCH; DELETE yo'q. API'da `code` majburiy (importlar kod bo'yicha bog'laydi). Ota yozuv yo'q — 404 `REFERENCE_NOT_FOUND`, nofaol — 409 `REFERENCE_INACTIVE`, band kod — 409 `CODE_TAKEN`.
2. **Tarix qoidalari** (`src/history/history-rules.ts`) — toza funksiyalar: `planAppend`, `planUpdateLast`, `planDeleteLast`, `planTermination`. Xatolar: `START_NOT_MONTH_START`, `INVALID_DATE_RANGE` (400); `HISTORY_ORDER`, `NOT_LAST_RECORD`, `PERIOD_CLOSED`, `NO_CHANGE` (409). Oxirgi CLOSED davr — `history-db.ts: lastClosedDay`.
3. **Xodimlar** (`src/employees/`): `/employees/:code` (biznes kodi), `?date=` bo'yicha joriy lavozim va oylik; `/employees/:code/assignments` va `/salaries` (GET, POST, PATCH/DELETE oxirgisiga). Ishdan ketish sanasi ochiq lavozim/maosh/team_links'ni yopadi va `isActive=false`. Har bir amal xodim qatorini `FOR UPDATE` bilan qulflab, tranzaksiyada, audit bilan.
4. **team_links** (`src/team-links/`): `/team-links` (filtr `leaderCode`, `memberCode`, `linkType`, `date`), tarix a'zo + tur bo'yicha.
5. **Import** (`src/imports/`): `POST /imports/{employees|team-links|products|clients}` (multipart, `file`), `GET /imports`, `/imports/:id`, `/imports/:id/errors`, `/imports/templates/:type`. Qatorlar avval xotirada rejalashtiriladi (`plans/*.ts`, toza), so'ng hammasi to'g'ri bo'lsa bitta tranzaksiyada yoziladi. Xato bo'lsa — batch INVALID, 422 `IMPORT_HAS_ERRORS`. 50 000 qatorli to'g'ri fayl ~20 soniya.
6. EXCLUDE buzilishi (Postgres `23P01`, Prisma 7 da `P2039` ichida) — 409 `HISTORY_OVERLAP`; katta fayl — 413 `PAYLOAD_TOO_LARGE`.
7. Audit amallari: `REFERENCE_CREATE/UPDATE`, `EMPLOYEE_CREATE/UPDATE`, `HISTORY_CREATE/UPDATE/DELETE`, `IMPORT_APPLY`, `IMPORT_INVALID`; `entity_type` — jadval nomi.
8. Yangi paketlar: `exceljs`, `@types/multer` (dev).

---

## 5-bosqich — KPI konstruktor ✅

Natija: `npm test` 282/282, `npm run typecheck` xatosiz, `npm run test:db` 120/120 (shundan 5-bosqich E2E 21), `npm run db:check-drift` — "No difference detected". Migratsiya yo'q (ERD o'zgarmadi, faqat `kpi_units` izohi).
Tasdiqlangan qarorlar — `docs/DECISIONS.md` 2.2 (plan turlarida bitta faol qoida, filtrsiz qoidadan keyingi qoida — xato) va 2.5.

1. **Konfiguratsiya tekshiruvi** (`src/kpis/kpi-config.ts`, toza): `validateKpiConfig(kpi, rules)` hamma xatolarni `{path, message}` ro'yxati qilib qaytaradi → 400 `INVALID_CONFIGURATION`. KPI: hisoblash turi, scope ↔ team_link_type, fact_source (EXCEL/MANUAL), aggregation + source_field (SUM — amount/quantity, COUNT* — ID maydonlar). Qoida: tur bo'yicha configuration kalitlari (noma'lum kalit — xato, qiymat ≥ 0), STEP pog'onalari, filtrlar (ID maydonlarda `= != IN NOT_IN` va faqat ID; amount/quantity'da `> >= < <=`), priority, faol qoidalar soni, ishlamaydigan qoida. Filtrdagi ID bazada bor va faol — servisda (`kpi-references.ts`).
2. **Amaldagi KPI'lar** (`src/kpis/effective-kpis.ts`, toza): `resolveEmployeeKpis` — (oydagi lavozim KPI'lari ∪ ADD) − REMOVE, manbasi (POSITION/ADD) va olib tashlanganlar bilan. 8-bosqich shuni chaqiradi.
3. **Biriktirish sanalari** (`src/kpis/kpi-dates.ts`, toza): start — oy boshi, end — oy oxiri yoki bo'sh (`END_NOT_MONTH_END`), ustma-ust — 409 `HISTORY_OVERLAP`, yopilgan davr — 409 `PERIOD_CLOSED`.
4. **Endpointlar** (o'qish — hamma rol, yozish — CALCULATOR): `/kpi-units` (ma'lumotnoma); `GET /kpis` (`search`, `isActive`, `calculationType`), `GET/PATCH /kpis/:code`, `POST /kpis` (qoidalari bilan birga); `POST /kpis/:code/rules`, `PUT/DELETE /kpis/:code/rules/:ruleId`; `GET/POST /position-kpis`, `PATCH/DELETE /position-kpis/:id`; `GET/POST /employees/:code/kpi-overrides`, `PATCH/DELETE .../:id`; `GET /employees/:code/kpis?year=&month=`.
5. Natijasi bor KPI'ning tuzilmasi o'zgarmaydi va ochiq biriktirishi bor KPI nofaol qilinmaydi — 409 `KPI_IN_USE`; natijasi bor qoida o'chirilmaydi — 409 `RULE_IN_USE`. Har bir yozish KPI qatorini `FOR UPDATE` bilan qulflab, tranzaksiyada.
6. Audit amallari: `KPI_CREATE`, `KPI_UPDATE`, `KPI_RULE_CREATE/UPDATE/DELETE`; biriktirish va override — `HISTORY_*` (`entity_type` = `position_kpis` / `employee_kpi_overrides`); birliklar — `REFERENCE_*`.
7. Testlar: `src/kpis/__tests__/` — validatsiya, resolver, sanalar va Excel tuzilishiga moslik (Savdo vakili qatorlari — alohida STEP KPI'lar, jami 2 325 297; Ekspeditor — "Savdodan %" 4 100 000 va "Logo salfetka" 5 000 000); `test/db/kpis.db-spec.ts` — E2E.
