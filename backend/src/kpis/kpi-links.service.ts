import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { dateOrNull, dateToIso, isoToDate } from '../common/iso-date';
import { Prisma } from '../generated/prisma/client';
import { lastClosedDay, requireActive, requireEmployee, runRule } from '../history/history-db';
import { PrismaService } from '../prisma/prisma.service';
import { EffectiveKpiSource } from './effective-kpis';
import { loadEffectiveKpis } from './effective-kpis-db';
import { DatedRange, planKpiLinkCreate, planKpiLinkDelete, planKpiLinkEnd } from './kpi-dates';
import {
  OVERRIDE_INCLUDE,
  OverrideView,
  POSITION_KPI_INCLUDE,
  PositionKpiView,
  snapshot,
  toOverrideView,
  toPositionKpiView,
} from './kpi-view';
import {
  CreateOverrideInput,
  CreatePositionKpiInput,
  EffectiveKpisQuery,
  PositionKpiListQuery,
  UpdateKpiLinkInput,
} from './kpis.schemas';

type Tx = Prisma.TransactionClient;

export interface EffectiveKpiView {
  kpiId: string;
  code: string;
  name: string;
  calculationType: string;
  source: EffectiveKpiSource;
}

export interface EffectiveKpisView {
  employeeCode: string;
  year: number;
  month: number;
  kpis: EffectiveKpiView[];
  /** REMOVE override bilan olib tashlangan lavozim/ADD KPI'lari — nega yo'qligi ko'rinsin. */
  removed: { kpiId: string; code: string; name: string }[];
}

/**
 * KPI'ni lavozimga biriktirish (position_kpis), xodim uchun ADD/REMOVE
 * (employee_kpi_overrides) va xodimning oydagi amaldagi KPI'lari.
 * Sana qoidalari — kpi-dates.ts; audit — HISTORY_* (entity_type = jadval nomi).
 */
@Injectable()
export class KpiLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------- Lavozimga biriktirish ----------

  async listPositionKpis(query: PositionKpiListQuery): Promise<PositionKpiView[]> {
    const rows = await this.prisma.positionKpi.findMany({
      where: { positionId: query.positionId, kpiId: query.kpiId },
      include: POSITION_KPI_INCLUDE,
      orderBy: [{ positionId: 'asc' }, { kpiId: 'asc' }, { startDate: 'asc' }],
    });
    return rows.map(toPositionKpiView);
  }

  async createPositionKpi(actor: AuthUser, input: CreatePositionKpiInput): Promise<PositionKpiView> {
    return this.prisma.$transaction(async (tx) => {
      const kpi = await lockKpi(tx, input.kpiId);
      const position = await tx.position.findUnique({ where: { id: input.positionId } });
      if (!position) throw referenceNotFound('Lavozim', input.positionId);
      requireActive(kpi, 'KPI');
      requireActive(position, 'Lavozim');

      const others = await tx.positionKpi.findMany({ where: { positionId: position.id, kpiId: kpi.id } });
      const closed = await lastClosedDay(tx);
      runRule(() => planKpiLinkCreate(others.map(toRange), input, closed));

      const row = await tx.positionKpi.create({
        data: { positionId: position.id, kpiId: kpi.id, startDate: isoToDate(input.startDate), endDate: toDate(input.endDate) },
        include: POSITION_KPI_INCLUDE,
      });
      const view = toPositionKpiView(row);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_CREATE',
        entityType: 'position_kpis',
        entityId: row.id,
        newData: snapshot(view),
      });
      return view;
    });
  }

  async updatePositionKpi(actor: AuthUser, id: bigint, input: UpdateKpiLinkInput): Promise<PositionKpiView> {
    return this.prisma.$transaction(async (tx) => {
      await lockKpi(tx, (await requirePositionKpi(tx, id)).kpiId);
      const target = await requirePositionKpi(tx, id);
      const records = await tx.positionKpi.findMany({ where: { positionId: target.positionId, kpiId: target.kpiId } });
      const closed = await lastClosedDay(tx);
      runRule(() => planKpiLinkEnd(records.map(toRange), id, input.endDate, closed));

      const row = await tx.positionKpi.update({ where: { id }, data: { endDate: toDate(input.endDate) }, include: POSITION_KPI_INCLUDE });
      const view = toPositionKpiView(row);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_UPDATE',
        entityType: 'position_kpis',
        entityId: id,
        oldData: snapshot(toPositionKpiView(target)),
        newData: snapshot(view),
      });
      return view;
    });
  }

  async deletePositionKpi(actor: AuthUser, id: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockKpi(tx, (await requirePositionKpi(tx, id)).kpiId);
      const target = await requirePositionKpi(tx, id);
      const closed = await lastClosedDay(tx);
      runRule(() => planKpiLinkDelete(toRange(target), closed));

      await tx.positionKpi.delete({ where: { id } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_DELETE',
        entityType: 'position_kpis',
        entityId: id,
        oldData: snapshot(toPositionKpiView(target)),
      });
    });
  }

  // ---------- Xodim uchun override ----------

  async listOverrides(code: string): Promise<OverrideView[]> {
    const employee = await requireEmployee(this.prisma, code);
    const rows = await this.prisma.employeeKpiOverride.findMany({
      where: { employeeId: employee.id },
      include: OVERRIDE_INCLUDE,
      orderBy: [{ startDate: 'asc' }, { id: 'asc' }],
    });
    return rows.map((row) => toOverrideView(row, code));
  }

  async createOverride(actor: AuthUser, code: string, input: CreateOverrideInput): Promise<OverrideView> {
    return this.prisma.$transaction(async (tx) => {
      const employee = await requireEmployee(tx, code, { lock: true });
      const kpi = await lockKpi(tx, input.kpiId);
      requireActive(kpi, 'KPI');

      // ADD va REMOVE bir KPI uchun ustma-ust tushmaydi (DB'dagi EXCLUDE ham action'ga qaramaydi).
      const others = await tx.employeeKpiOverride.findMany({ where: { employeeId: employee.id, kpiId: kpi.id } });
      const closed = await lastClosedDay(tx);
      runRule(() => planKpiLinkCreate(others.map(toRange), input, closed));

      const row = await tx.employeeKpiOverride.create({
        data: {
          employeeId: employee.id,
          kpiId: kpi.id,
          action: input.action,
          startDate: isoToDate(input.startDate),
          endDate: toDate(input.endDate),
        },
        include: OVERRIDE_INCLUDE,
      });
      const view = toOverrideView(row, code);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_CREATE',
        entityType: 'employee_kpi_overrides',
        entityId: row.id,
        newData: snapshot(view),
      });
      return view;
    });
  }

  async updateOverride(actor: AuthUser, code: string, id: bigint, input: UpdateKpiLinkInput): Promise<OverrideView> {
    return this.prisma.$transaction(async (tx) => {
      const employee = await requireEmployee(tx, code, { lock: true });
      const target = await requireOverride(tx, employee.id, id);
      const records = await tx.employeeKpiOverride.findMany({ where: { employeeId: employee.id, kpiId: target.kpiId } });
      const closed = await lastClosedDay(tx);
      runRule(() => planKpiLinkEnd(records.map(toRange), id, input.endDate, closed));

      const row = await tx.employeeKpiOverride.update({
        where: { id },
        data: { endDate: toDate(input.endDate) },
        include: OVERRIDE_INCLUDE,
      });
      const view = toOverrideView(row, code);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_UPDATE',
        entityType: 'employee_kpi_overrides',
        entityId: id,
        oldData: snapshot(toOverrideView(target, code)),
        newData: snapshot(view),
      });
      return view;
    });
  }

  async deleteOverride(actor: AuthUser, code: string, id: bigint): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const employee = await requireEmployee(tx, code, { lock: true });
      const target = await requireOverride(tx, employee.id, id);
      const closed = await lastClosedDay(tx);
      runRule(() => planKpiLinkDelete(toRange(target), closed));

      await tx.employeeKpiOverride.delete({ where: { id } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'HISTORY_DELETE',
        entityType: 'employee_kpi_overrides',
        entityId: id,
        oldData: snapshot(toOverrideView(target, code)),
      });
    });
  }

  // ---------- Amaldagi KPI'lar ----------

  async effectiveKpis(code: string, query: EffectiveKpisQuery): Promise<EffectiveKpisView> {
    const employee = await requireEmployee(this.prisma, code);
    const result = (await loadEffectiveKpis(this.prisma, [employee.id], query.year, query.month)).get(employee.id.toString())!;

    const ids = [...result.kpis.map((kpi) => kpi.kpiId), ...result.removed].map((id) => BigInt(id));
    const definitions = await this.prisma.kpiDefinition.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, name: true, calculationType: true },
    });
    const byId = new Map(definitions.map((row) => [row.id.toString(), row]));
    const byCode = (a: { code: string }, b: { code: string }) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

    return {
      employeeCode: code,
      year: query.year,
      month: query.month,
      kpis: result.kpis
        .map(({ kpiId, source }) => {
          const kpi = byId.get(kpiId)!;
          return { kpiId, code: kpi.code, name: kpi.name, calculationType: kpi.calculationType, source };
        })
        .sort(byCode),
      removed: result.removed
        .map((kpiId) => {
          const kpi = byId.get(kpiId)!;
          return { kpiId, code: kpi.code, name: kpi.name };
        })
        .sort(byCode),
    };
  }
}

// ---------------------------------------------------------------------------

/** KPI id bo'yicha, qatorni qulflab: KPI nofaol qilinishi bilan bir vaqtda biriktirish bo'lmasin. */
async function lockKpi(tx: Tx, id: bigint): Promise<{ id: bigint; isActive: boolean }> {
  const rows = await tx.$queryRaw<{ id: bigint; is_active: boolean }[]>`
    SELECT id, is_active FROM kpi_definitions WHERE id = ${id} FOR UPDATE`;
  if (rows.length === 0) throw referenceNotFound('KPI', id);
  return { id: rows[0].id, isActive: rows[0].is_active };
}

async function requirePositionKpi(tx: Tx, id: bigint) {
  const row = await tx.positionKpi.findUnique({ where: { id }, include: POSITION_KPI_INCLUDE });
  if (!row) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Lavozim KPI'si topilmadi (id=${id})`);
  return row;
}

/** Yozuv shu xodimga tegishli bo'lishi kerak — boshqa xodimning id'si bilan topilmaydi. */
async function requireOverride(tx: Tx, employeeId: bigint, id: bigint) {
  const row = await tx.employeeKpiOverride.findFirst({ where: { id, employeeId }, include: OVERRIDE_INCLUDE });
  if (!row) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Override topilmadi (id=${id})`);
  return row;
}

function referenceNotFound(label: string, id: bigint): AppError {
  return new AppError(HttpStatus.NOT_FOUND, 'REFERENCE_NOT_FOUND', `${label} topilmadi (id=${id})`);
}

function datesOf(row: { startDate: Date; endDate: Date | null }): { startDate: string; endDate: string | null } {
  return { startDate: dateToIso(row.startDate), endDate: dateOrNull(row.endDate) };
}

function toRange(row: { id: bigint; startDate: Date; endDate: Date | null }): DatedRange {
  return { id: row.id, ...datesOf(row) };
}

function toDate(iso: string | null): Date | null {
  return iso === null ? null : isoToDate(iso);
}
