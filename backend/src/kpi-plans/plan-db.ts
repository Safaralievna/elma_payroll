import { Prisma } from '../generated/prisma/client';
import { planShapeFor, PlanShape } from './plan-rules';

export interface PlanKpi {
  id: bigint;
  code: string;
  name: string;
  calculationType: string;
  isActive: boolean;
  shape: PlanShape;
}

/**
 * KPI'lar faol qoidalari bilan → plan shakli. `lock` — KPI qatorlari `FOR SHARE` bilan
 * qulflanadi: plan yozilayotganda KPI turi yoki qoidasi (KpisService, `FOR UPDATE`) o'zgarmasin.
 */
export async function loadPlanKpis(
  db: Prisma.TransactionClient,
  where: { ids?: readonly bigint[]; codes?: readonly string[] },
  options: { lock?: boolean } = {},
): Promise<PlanKpi[]> {
  const filter: Prisma.KpiDefinitionWhereInput = where.ids ? { id: { in: [...where.ids] } } : { code: { in: [...(where.codes ?? [])] } };
  if (options.lock) {
    const ids = (await db.kpiDefinition.findMany({ where: filter, select: { id: true } })).map((row) => row.id);
    if (ids.length > 0) await db.$queryRaw`SELECT id FROM kpi_definitions WHERE id = ANY(${ids}) ORDER BY id FOR SHARE`;
  }
  const rows = await db.kpiDefinition.findMany({
    where: filter,
    select: {
      id: true,
      code: true,
      name: true,
      calculationType: true,
      isActive: true,
      rules: { where: { isActive: true }, select: { configuration: true } },
    },
  });
  return rows.map(({ rules, ...kpi }) => ({
    ...kpi,
    shape: planShapeFor(
      kpi.calculationType,
      rules.map((rule) => (rule.configuration ?? {}) as Record<string, unknown>),
    ),
  }));
}
