/**
 * Boshlang'ich ma'lumotlar (docs/PLAN.md, 2-bosqich, 6-band).
 *
 * Idempotent: hamma yozuv unique kalit bo'yicha upsert qilinadi — qayta
 * ishga tushirilsa dublikat yaratilmaydi. Mavjud yozuvlar (masalan, admin paroli)
 * qayta yozilmaydi.
 *
 * Ishga tushirish: npm run db:seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';

const ROLES = [
  { name: 'ADMIN', description: 'Administrator' },
  { name: 'CALCULATOR', description: 'Hisoblovchi' },
  { name: 'APPROVER', description: 'Tasdiqlovchi' },
];

const POSITIONS = [
  { code: 'SALES_REP', name: 'Savdo vakili', depositPercent: null },
  { code: 'SUPERVISOR', name: 'Supervayzer', depositPercent: null },
  { code: 'OPERATOR', name: 'Operator', depositPercent: null },
  { code: 'EXPEDITOR', name: 'Yetkazib berish (Ekspeditor)', depositPercent: '10' },
];

const KPI_UNITS = [
  { code: 'UZS', name: "So'm" },
  { code: 'DONA', name: 'Dona' },
  { code: 'AKB', name: 'AKB (faol mijozlar soni)' },
];

const PRICE_TYPES = [
  { code: 'ULGURJI', name: 'Ulgurji' },
  { code: 'CHAKANA', name: 'Chakana' },
];

/** Excel ("Торговый представитель" varag'i) dagi 4 pog'ona — excel-reference.spec.ts bilan bir xil. */
const SALES_VOLUME_STEPS = [
  { minPercent: '70', maxPercent: '80', coefficient: '2', maxRewardPercent: '20' },
  { minPercent: '80', maxPercent: '90', coefficient: '3', maxRewardPercent: '30' },
  { minPercent: '90', maxPercent: '100', coefficient: '5', maxRewardPercent: '50' },
  { minPercent: '100', maxPercent: '150', coefficient: '1', maxRewardPercent: '50' },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!connectionString) {
    throw new Error("DATABASE_URL o'rnatilmagan (backend/.env ga qarang)");
  }
  if (!adminPassword) {
    throw new Error("SEED_ADMIN_PASSWORD o'rnatilmagan (backend/.env ga qarang)");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  // Xesh tranzaksiyadan oldin — tranzaksiya qisqa bo'lishi uchun.
  const passwordHash = await hash(adminPassword);

  try {
    await prisma.$transaction(async (tx) => {
      for (const role of ROLES) {
        await tx.role.upsert({ where: { name: role.name }, create: role, update: {} });
      }

      const admin = await tx.user.upsert({
        where: { username: 'admin' },
        create: { username: 'admin', passwordHash },
        update: {},
      });
      const adminRole = await tx.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
      await tx.userRole.upsert({
        where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
        create: { userId: admin.id, roleId: adminRole.id },
        update: {},
      });

      for (const position of POSITIONS) {
        await tx.position.upsert({ where: { code: position.code }, create: position, update: {} });
      }

      for (const unit of KPI_UNITS) {
        await tx.kpiUnit.upsert({ where: { code: unit.code }, create: unit, update: {} });
      }

      for (const priceType of PRICE_TYPES) {
        await tx.priceType.upsert({ where: { code: priceType.code }, create: priceType, update: {} });
      }

      // Namuna KPI: "Umumiy savdo hajmi" — STEP, SUM(amount), OWN.
      const uzs = await tx.kpiUnit.findUniqueOrThrow({ where: { code: 'UZS' } });
      const kpi = await tx.kpiDefinition.upsert({
        where: { code: 'SALES_VOLUME' },
        create: {
          code: 'SALES_VOLUME',
          name: 'Umumiy savdo hajmi',
          unitId: uzs.id,
          calculationType: 'STEP',
          aggregation: 'SUM',
          sourceField: 'amount',
          scope: 'OWN',
          factSource: 'EXCEL',
        },
        update: {},
      });

      const rule = await tx.kpiRule.upsert({
        where: { kpiId_priority: { kpiId: kpi.id, priority: 1 } },
        create: { kpiId: kpi.id, name: 'Asosiy qoida', priority: 1 },
        update: {},
      });

      for (const step of SALES_VOLUME_STEPS) {
        await tx.kpiRuleStep.upsert({
          where: { kpiRuleId_minPercent: { kpiRuleId: rule.id, minPercent: step.minPercent } },
          create: { kpiRuleId: rule.id, ...step },
          update: {},
        });
      }

      const salesRep = await tx.position.findUniqueOrThrow({ where: { code: 'SALES_REP' } });
      const startDate = new Date('2026-01-01');
      await tx.positionKpi.upsert({
        where: {
          positionId_kpiId_startDate: { positionId: salesRep.id, kpiId: kpi.id, startDate },
        },
        create: { positionId: salesRep.id, kpiId: kpi.id, startDate },
        update: {},
      });
    });
    console.log('Seed tayyor.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed xatosi:', error);
  process.exit(1);
});
