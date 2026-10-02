# ELMA Payroll — loyiha qoidalari (AI agent uchun)

Bu fayl har bir sessiya boshida o'qiladi. Bu yerdagi qarorlar **team lead va rahbariyat tomonidan tasdiqlangan** — ularni o'zgartirma, o'zingcha yangi biznes qoidasi ixtiro qilma. Biror narsa noaniq bo'lsa, kod yozishdan oldin foydalanuvchidan so'ra.

Foydalanuvchi bilan **o'zbek tilida**, sodda va tushunarli gaplash. Har bir qadamda nima qilganingni va nega shunday qilganingni qisqa tushuntir — foydalanuvchi kodni o'rganmoqda.

## Loyiha nima haqida

Savdo va logistika xodimlarining ish haqi va KPI'si hozir Excel'da qo'lda hisoblanadi. Biz uni veb-ilovaga ko'chiramiz: o'sha formulalar, lekin rollar, audit, davrni yopish va hisobotlar bilan.

Lavozimlar: Savdo vakili, Supervayzer, Operator, Yetkazib berish (Ekspeditor).

Batafsil biznes qarorlari: **`docs/DECISIONS.md`** (majburiy o'qiladi, hisob-kitobga tegishli har qanday ishdan oldin).
Ish rejasi va holati: **`docs/PLAN.md`**.
Baza sxemasi: **`docs/ERD_v2.dbml`** — jadvallar, ustunlar va cheklovlar uchun yagona manba. Undan chetga chiqma, jadval yoki ustunni taxmin qilma.

## Stek

- Backend: NestJS + TypeScript (`backend/`)
- DB: PostgreSQL + Prisma ORM. Prisma sxemasida yozib bo'lmaydigan cheklovlar (CHECK, partial unique, EXCLUDE, trigger) — migratsiya fayliga qo'lda SQL.
- Validatsiya: Zod. Auth: JWT, parollar argon2 bilan xeshlanadi.
- Pul: `decimal.js` (Prisma Decimal bilan mos). Excel: `exceljs`.
- Frontend (keyinroq): React + TypeScript + Tailwind (`frontend/`), oddiy jadval va formalar.
- Frontend dizayni (ranglar, shriftlar, tugmalar, komponentlar) — team lead beradigan kompaniya dizayn tizimi asosida. O'zingcha rang, shrift yoki komponent uslubi tanlama. Dizayn tizimi `docs/` ga qo'yilmaguncha frontend yozishni boshlama.
- Lokal DB: Docker (docker-compose).
- MVP'da YO'Q: Redis/BullMQ, Telegraf, Smartup API.

## Qat'iy qoidalar

1. **Pul hisob-kitobida `number` ishlatilmaydi** — faqat `Decimal` (`src/calculation/decimal.ts`). DB'da pul `Decimal(18,2)`.
2. **Biznes raqamlari kodga yozilmaydi** — pog'onalar, foizlar, stavkalar DB konfiguratsiyasidan keladi.
3. **Hisoblash yadrosi** (`src/calculation/`) — toza funksiyalar: Prisma, NestJS, HTTP'ga bog'liq emas. DB bilan ishlaydigan servislar yadroni chaqiradi.
4. **CLOSED davr o'zgarmaydi.** Hech bir endpoint yopilgan davr ma'lumotini o'zgartirmasin. Tuzatish — keyingi OPEN davrda `recalculations`.
5. **Audit** — muhim o'zgarishlar `audit_logs` ga yoziladi; audit yozuvlari o'chirilmaydi va o'zgartirilmaydi.
6. **Xatolar jim yutib yuborilmaydi** — aniq kod va xabar bilan qaytariladi.
7. Bir nechta jadvalni o'zgartiradigan amallar — **tranzaksiya** ichida.
8. Xodim faqat `employee_id` (biznes kodi) orqali aniqlanadi, ism bo'yicha hech qachon.
9. Prisma: `employees.employee_id` (varchar biznes kodi) Prisma'da `employeeCode @map("employee_id")` deb nomlanadi — boshqa jadvallardagi `employee_id` (FK) bilan chalkashmasligi uchun.
10. Keraksiz murakkablik qo'shma (ortiqcha abstraksiya, repository qatlami Prisma ustidan va h.k.).

## Ish uslubi

- Bir vaqtda **faqat bitta bosqich** (`docs/PLAN.md`). Bosqich tugamaguncha keyingisiga o'tma.
- Avval test, keyin kod (ayniqsa hisob-kitobda). Har bosqich oxirida: `npm test` va `npm run typecheck` xatosiz o'tishi shart.
- Mavjud testlarni "o'tishi uchun" o'zgartirma — faqat `docs/DECISIONS.md` dagi qaror shuni talab qilsa.
- Bosqich tugagach: `docs/PLAN.md` da holatni yangila va foydalanuvchiga qisqa xulosa ber (nima qilindi, qanday tekshirish mumkin). Git commit'ni foydalanuvchi so'raganda qil.

## Buyruqlar

```bash
cd backend
npm install
npm test            # hamma testlar
npm run typecheck   # TypeScript tekshiruvi
npm run start:dev   # serverni ishga tushirish
```
