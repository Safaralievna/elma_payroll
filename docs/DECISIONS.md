# Tasdiqlangan qarorlar

Manba: TZ, Excel, taqdimot, tasdiqlangan ERD/flowchart, `test_cases.json`, team lead va rahbariyat javoblari (2026-10-01).
**Bu qarorlar o'zgartirilmaydi.** "(texnik qaror)" belgisi — team lead javobidan kelib chiqib loyiha arxitektori qabul qilgan aniqlashtirish.

---

## 1. Pul va yaxlitlash

- Hamma pul summasi **UZS**. Alohida valyuta maydoni yo'q.
- Hisob-kitob faqat `decimal.js` bilan. Oraliq qiymatlar yaxlitlanmaydi.
- **Har bir hisob qatori** butun so'mgacha (half-up) yaxlitlanadi. Hisob qatori = KPI qoidasi natijasi (`kpi_result_rules.amount`). (texnik qaror: Ekspeditorda bir KPI'da 3 qoida — har biri alohida qator bo'lib ko'rinadi)
- KPI summasi = yaxlitlangan qoida qatorlari yig'indisi. Payroll jamlari = yaxlitlangan qatorlar yig'indisi. Hisob varag'idagi qatorlar yig'indisi doim jamiga teng.
- Excel bilan 1 so'm farq normal. Etalon: Savdo vakili KPI jami **2 325 297**, ish haqi **4 565 297**.

## 2. KPI hisoblash

### 2.1 Turlar

| Tur | Formula | Plan kerakmi |
|-----|---------|--------------|
| STEP | baza × Σ clamp((min(bajarilish, max) − min) × koef, 0, limit) / 100 — kumulyativ | Ha |
| LINEAR | baza × bajarilish% / 100, config: `min_percent` (pastda → 0), `max_percent` (shift) | Ha |
| RESULT_PERCENTAGE | fakt × `percent` / 100 | Yo'q |
| PER_UNIT | fakt × `rate_per_unit` | Yo'q |
| FIXED | shart bajarilsa `amount`. Config: `{"min_achievement": 100, "amount": 500000}`. `min_achievement` yo'q bo'lsa — shartsiz | Faqat `min_achievement` bo'lsa |
| MANUAL | qo'lda kiritilgan summa ("qarzdorlarni yopish" hozircha shunday) | Yo'q |

- Bajarilish = fakt / plan × 100. Plan kerak bo'lgan joyda plan yo'q yoki ≤ 0 → validatsiya xatosi (0 ga bo'linmaydi, jim o'tkazilmaydi).
- Operator uchun standart tur — **STEP** (konstruktorda o'zgartiriladi, kod emas).
- Yangi hisoblash turini faqat dasturchi qo'shadi (registry). Parametrlar — DB'da.

### 2.2 Qoidalar va filtrlar

- Bitta KPI = bir yoki bir nechta qoida (`kpi_rules`). Qoida ichidagi filtrlar — **AND**.
- **Bitta KPI ichida** savdo qatori faqat **bitta** qoidada hisoblanadi — `priority` bo'yicha birinchi mos kelganida. `priority` kichik raqam = birinchi tekshiriladi. (texnik qaror: tartib yo'nalishi)
- **Har xil KPI'larda** bir qator har birida mustaqil hisoblanadi.
- Har bir qoidaning o'z fakti va summasi bor → `kpi_result_rules (kpi_result_id, kpi_rule_id, fact_value, amount)`. Har qoidani alohida KPI qilinmaydi.
- `kpi_facts` — KPI darajasida bitta yozuv, unique `(period_id, employee_id, kpi_id)`.
- Filtr qiymatlari (`kpi_rule_filters.values`) — ID'lar (kodlar emas). (texnik qaror)
- Bitta KPI ichida ikki qoidaning `priority` qiymati bir xil bo'lsa (yoki qoida takrorlansa) — **validatsiya xatosi** (`INVALID_CONFIGURATION`): qaysi qoida birinchi ekani noaniq bo'lib qoladi. (team lead tasdiqladi, 2026-10-01)

### 2.3 Fakt va aggregation

- Fakt faqat ACTIVE import versiyasidagi `sales_lines` dan hisoblanadi.
- SUM / COUNT / COUNT_DISTINCT.
- **AKB** = mijozning shu davr va KPI filtri bo'yicha **sof xaridi (summa bo'yicha) > 0** bo'lgan mijozlar soni. (texnik qaror: "sof xarid" summa bo'yicha)
- **Manfiy fakt xato emas** (qaytarishlar sotuvdan ko'p bo'lishi mumkin). Har bir qoidaning to'lovi 0 dan kam bo'lmaydi: STEP, LINEAR, RESULT_PERCENTAGE, PER_UNIT uchun `max(0, natija)`. Qoida natijasiga `NEGATIVE_FACT` ogohlantirishi qo'shiladi va review ekranida ko'rinadi. (team lead tasdiqladi, 2026-10-01)

### 2.4 Jamoa (TEAM scope)

- `employee_assignments.manager_id` **o'rniga** `team_links (leader_id, member_id, link_type: SUPERVISOR | OPERATOR, start_date, end_date)`.
- Savdo vakili bir vaqtda ham supervayzerga, ham operatorga bo'ysunishi mumkin.
- KPI'da `scope = TEAM` bo'lsa, qaysi havola turi ishlatilishi `kpi_definitions.team_link_type` da saqlanadi (texnik qaror).
- Savdo qatori **savdo kunidagi** (`sale_date`) rahbar jamoasiga yoziladi.
- Rahbarning o'z savdosi TEAM faktiga kirmaydi.

## 3. Ish haqi (payroll)

```
gross           = fixed + kpi + bonus                         (qayta hisob KIRMAYDI)
deposit_base    = gross − penalty                              (avans, qarz KIRMAYDI)
deposit         = deposit_base > 0 ? round(deposit_base × deposit_percent / 100) : 0
                  (deposit_percent = NULL → depozit yo'q)
net             = gross − penalty − deposit − advance − debt_carryover
                  + recalculation + deposit_return
payable         = max(net, 0)
yangi qarz      = net < 0 ? −net : 0  → keyingi davrga
```

Tekshiruv: KPI 6 740 000, jarima 300 000, avans 1 000 000, depozit 10% → depozit 644 000, net 4 796 000.

- `debt_carryover` (texnik qaror: depozitdan keyin, avans kabi ayiriladi) va `deposit_return` — `payroll_items` da alohida qatorlar (`DEBT_CARRYOVER`, `DEPOSIT_RETURN`).
- Hisoblash yadrosida `debt_carryover` va `deposit_return` berilmasa — 0 deb olinadi (qarz yoki qaytarish yo'q). (team lead tasdiqladi, 2026-10-01)

### 3.1 Qarz

- Net manfiy → to'lanadigan = 0, qoldiq `employee_debts (employee_id, source_period_id, target_period_id, amount, status)` ga yoziladi va keyingi davrda `DEBT_CARRYOVER` qatori bo'ladi.

### 3.2 Depozit

- `deposits` — faqat oylik yig'ilish yozuvlari, unique `(employee_id, period_id)`. `status` ustuni yo'q.
- `deposit_withdrawals (employee_id, period_id, amount, reason, payout_type: PAYROLL | SEPARATE, created_by, created_at)`.
- Balans = Σ deposits − Σ withdrawals. Balansdan ko'p yechib bo'lmaydi.
- PAYROLL → shu davr payroll'ida `DEPOSIT_RETURN` qatori. SEPARATE → pul alohida beriladi, tizim faqat yozadi.
- Istalgan oyda, istalgan summa (ishdan ketishda, fors-majorda). Hammasi audit'ga. MVP'ga kiradi.

### 3.3 To'lov

- `payroll_payments (payroll_id, method: CARD | CASH, amount)`.
- CARD + CASH = `payable` (texnik qaror). Avans alohida — u oldin berilgan.
- Talabnoma = naqd summalar ro'yxati (xodim, summa, jami) → Excel. Vedomost → Excel.
- Bank importi va solishtirish — MVP'dan keyin.

## 4. Import

- Turlar: SALES, PLANS, EMPLOYEES (va ma'lumotnomalar).
- Har yuklash — yangi versiya; eskilari o'chirilmaydi.
- `file_hash` (SHA-256): shu davr va turda bir xil fayl allaqachon bo'lsa → "Bu fayl allaqachon yuklangan".
- **Bitta qator xato bo'lsa ham fayl ACTIVE bo'lmaydi.** Xatolar ro'yxati ko'rsatiladi, tuzatib qayta yuklanadi.
- Batch statuslari (texnik qaror): `ACTIVE`, `ARCHIVED`, `INVALID`, `COMPARISON`.
- Bitta `(period_id, import_type)` da faqat bitta ACTIVE — partial unique index.
- **OPEN davr**: yaroqli yangi versiya ACTIVE bo'ladi, eskisi ARCHIVED; so'ng "nima o'zgardi" ekrani: xodim | eski | yangi | farq.
- **CLOSED davr**: faqat solishtirish (`COMPARISON`). Farq ko'rsatiladi, ACTIVE almashmaydi, hech narsa qayta hisoblanmaydi.
- `kpi_plans.import_batch_id` — nullable (qo'lda kiritilsa NULL).
- Ma'lumotnomalar (mahsulot, mijoz, narx turi) savdo importidan oldin tizimda bo'lishi kerak.

### 4.1 Qaytarishlar

- Faqat `sales_lines` da manfiy summa va dona ruxsat etiladi (boshqa pul jadvallarida ≥ 0).
- Shablonda `asl_sotuv_sanasi` ustuni (faqat qaytarish qatorlari uchun) → `sales_lines.original_sale_date` (nullable).
- Qaytarishning asl sotuv sanasi **o'tgan oyda** bo'lsa → joriy oy faktiga kirmaydi, faqat "o'tgan oylar qaytarishlari" ro'yxatida ko'rinadi.
- Yopilgan oy ish haqiga hech qachon tegilmaydi.

## 5. Davr va rollar

- Statuslar: `OPEN → REVIEW → CLOSED`. REVIEW'dan OPEN'ga qaytarish mumkin (tuzatish uchun).
- Hisoblovchi hisoblaydi va REVIEW'ga yuboradi; tasdiqlovchi tekshiradi va yopadi. **Bir kishi o'zi hisoblab, o'zi yopa olmaydi.**
- CLOSED → hech narsa o'zgarmaydi; tuzatish keyingi OPEN davrda `recalculations`.
- MVP rollari: `ADMIN`, `CALCULATOR` (hisoblovchi), `APPROVER` (tasdiqlovchi). Audit hammasi uchun.

## 6. ERD v2 — tasdiqlangan ERD'ga o'zgarishlar

To'liq sxema: `docs/ERD_v2.dbml`.

Qo'shiladi:
- `kpi_result_rules (id, kpi_result_id, kpi_rule_id, fact_value, amount)`
- `team_links (id, leader_id, member_id, link_type, start_date, end_date)`
- `employee_debts (id, employee_id, source_period_id, target_period_id, amount, status)`
- `deposit_withdrawals (id, employee_id, period_id, amount, reason, payout_type, created_by, created_at)`
- `payroll_payments (id, payroll_id, method, amount)`
- `import_batches.file_hash`
- `kpi_plans.import_batch_id` (nullable)
- `sales_lines.original_sale_date` (nullable)
- `kpi_definitions.team_link_type` (nullable; scope = TEAM bo'lsa majburiy)
- `payrolls.debt_carryover_amount`, `payrolls.deposit_return_amount`, `payrolls.payable_amount`

O'zgaradi / olib tashlanadi:
- `employee_assignments.manager_id` — olib tashlanadi (`team_links` bilan almashtirildi)
- `deposits.status`, `deposits.paid_at` — olib tashlanadi
- `kpi_facts` — unique `(period_id, employee_id, kpi_id)`
- `payroll_items.item_type` ga `DEBT_CARRYOVER` qo'shiladi

Migratsiyadagi cheklovlar:
- Status/tur ustunlari uchun CHECK (ruxsat etilgan qiymatlar ro'yxati).
- `month BETWEEN 1 AND 12`; tarixiy jadvallarda `end_date IS NULL OR end_date >= start_date`.
- Tarixiy yozuvlar ustma-ust tushmasligi: `EXCLUDE USING gist` (`btree_gist`) — `employee_assignments`, `employee_salary_history`, `position_kpis`, `employee_kpi_overrides`, `team_links`.
- Pul summalari ≥ 0 (`sales_lines` va `recalculations.amount` bundan mustasno).
- `deposit_percent BETWEEN 0 AND 100`; `plan_value > 0` (NULL bo'lmasa).
- `recalculations.source_period_id <> target_period_id`.
- `audit_logs` — UPDATE/DELETE'ni to'suvchi trigger.
- Hamma `created_at` — `NOT NULL DEFAULT now()`.

## 7. MVP chegarasi

**MVP'ga kiradi:** ma'lumotnomalar, xodimlar, team_links (Excel + qo'lda); KPI konstruktor; plan (qo'lda / Excel); savdo importi (OPEN almashtirish, CLOSED solishtirish, "nima o'zgardi"); hisoblash + payroll (bonus, jarima, avans, depozit yig'ish va yechish, qarzni o'tkazish); davr OPEN → REVIEW → CLOSED; rollar admin/hisoblovchi/tasdiqlovchi + audit; Vedomost (Excel), karta/naqd, Talabnoma.

**MVP'dan keyin:** rahbar faqat o'z jamoasini ko'radi, auditor roli, dashboard/hisobotlar, bank importi, ustunlarni moslash konstruktori, Smartup API, KPI qoidalari versiyasi.

Tayyor bo'lgach: birinchi oy Excel bilan parallel hisoblanib solishtiriladi.
