# ELMA — ish haqi va KPI hisoblash tizimi

```
elma-payroll/
├── docker-compose.yml          PostgreSQL 16 (lokal, port 5433)
├── backend/                    NestJS + TypeScript + Prisma 7
│   ├── prisma/
│   │   ├── schema.prisma           41 jadval (manba: docs/ERD_v2.dbml)
│   │   ├── migrations/             init (Prisma) + constraints (qo'lda SQL)
│   │   └── seed.ts                 rollar, admin, lavozimlar, namuna KPI
│   ├── prisma.config.ts
│   ├── src/
│   │   ├── calculation/            hisoblash yadrosi (bazasiz, toza funksiyalar)
│   │   ├── prisma/                 PrismaService + PrismaModule
│   │   └── generated/prisma/       generatsiya qilingan klient (git'da yo'q)
│   └── test/
│       ├── fixtures/test_cases.json
│       └── db/                     DB cheklovlari testlari (npm run test:db)
├── frontend/                   (keyinroq) React + TypeScript + Tailwind
└── docs/
    ├── DECISIONS.md                tasdiqlangan biznes qarorlari
    ├── PLAN.md                     bosqichlar va holat
    ├── ERD_v2.dbml                 baza sxemasi — yagona manba
    └── ERD_v1.dbml                 asl tasdiqlangan ERD (tarix uchun)
```

## Ishga tushirish

Kerak: Node.js 20+, Docker.

```bash
# 1. Baza (loyiha ildizida)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # kerak bo'lsa SEED_ADMIN_PASSWORD ni o'zgartiring
npm install                 # postinstall: prisma generate
npm run db:migrate          # migratsiyalarni qo'llash
npm run db:seed             # boshlang'ich ma'lumotlar (qayta ishga tushirsa ham xavfsiz)
npm run start:dev
```

Seed `admin` foydalanuvchisini yaratadi, paroli — `.env` dagi `SEED_ADMIN_PASSWORD`.

## Tekshiruvlar

```bash
npm test                # hisoblash yadrosi testlari (bazasiz)
npm run typecheck       # TypeScript
npm run test:db         # DB cheklovlari — Docker'dagi bazada (alohida elma_payroll_test)
npm run db:check-drift  # schema.prisma va baza bir xilmi — "No difference detected" bo'lishi shart
```

`test:db` har safar `elma_payroll_test` bazasini noldan yaratadi — asosiy `elma_payroll` ga tegmaydi.

## Sxemani o'zgartirish

1. Avval `docs/ERD_v2.dbml` (team lead tasdig'i bilan), keyin `prisma/schema.prisma`.
2. `npx prisma migrate dev --create-only --name <nom>` → hosil bo'lgan SQL ni ko'rib chiqing; Prisma yoza olmaydigan cheklovlarni (CHECK, EXCLUDE, partial unique, trigger) shu faylga qo'lda qo'shing.
3. `npm run db:migrate`, so'ng `npm run db:check-drift` — farq bo'lmasligi kerak.

`prisma migrate dev` ni migratsiyasiz ishlatmang: u interaktiv bo'lib qotib qolishi mumkin. Farqni `db:check-drift` bilan tekshiring.

## DataGrip (yoki boshqa SQL klient) bilan ulanish

| Maydon   | Qiymat         |
|----------|----------------|
| Host     | `localhost`    |
| Port     | `5433`         |
| User     | `elma`         |
| Password | `elma`         |
| Database | `elma_payroll` |

URL: `jdbc:postgresql://localhost:5433/elma_payroll`. Port 5433 — kompyuterdagi boshqa PostgreSQL (5432) bilan to'qnashmasligi uchun.

## Asosiy qoidalar

- **Pul.** Hisob-kitob faqat `decimal.js` bilan, `number` ishlatilmaydi. Har bir hisob qatori butun so'mgacha (half-up) yaxlitlanadi. DB'da pul `Decimal(18,2)`.
- **Formula va qarorlar** — `docs/DECISIONS.md` (gross, depozit, net, qarz, qaytarishlar).
- **Konfiguratsiya.** Pog'onalar, foizlar va stavkalar kodda emas, DB'da saqlanadi.
- **Cheklovlar bazada.** Status ro'yxatlari, sanalar, ustma-ust tushmaslik, bitta ACTIVE import, `audit_logs` o'zgarmasligi — migratsiyadagi SQL bilan himoyalangan.
