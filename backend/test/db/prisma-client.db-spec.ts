/**
 * PrismaService haqiqiy bazaga ulanadi va sxema nomlari (@map) to'g'ri ishlaydi.
 * Hamma o'zgarish tranzaksiya ichida va oxirida bekor qilinadi.
 */
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../src/prisma/prisma.service';
import { testDatabaseUrl } from './db-helpers';

class Rollback extends Error {}

describe('PrismaService', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env.DATABASE_URL = testDatabaseUrl();
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  it('employeeCode → employees.employee_id; pul Decimal sifatida aniq saqlanadi', async () => {
    const run = prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({ data: { employeeCode: 'TP-001' } });
      const raw = await tx.$queryRaw<{ employee_id: string }[]>`
        SELECT employee_id FROM employees WHERE id = ${employee.id}`;
      expect(raw[0].employee_id).toBe('TP-001');

      const salary = await tx.employeeSalaryHistory.create({
        data: { employeeId: employee.id, salaryAmount: '2240000.55', startDate: new Date('2026-01-01') },
      });
      expect(new Decimal(salary.salaryAmount.toString()).equals('2240000.55')).toBe(true);

      throw new Rollback();
    });
    await expect(run).rejects.toBeInstanceOf(Rollback);
    expect(await prisma.employee.count({ where: { employeeCode: 'TP-001' } })).toBe(0);
  });
});
