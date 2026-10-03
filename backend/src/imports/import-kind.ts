import { AuditEntry } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { OpenPeriod } from '../periods/period-db';
import { ColumnSpec, SheetRow } from './excel/sheet';
import { RowOutcome } from './plans/tracked-history';

export type Tx = Prisma.TransactionClient;

/** URL'dagi tur → import_batches.import_type. SALES — 7-bosqichda. */
export const IMPORT_TYPES = {
  employees: 'EMPLOYEES',
  'team-links': 'TEAM_LINKS',
  products: 'PRODUCTS',
  clients: 'CLIENTS',
  plans: 'PLANS',
} as const;
export type ImportPath = keyof typeof IMPORT_TYPES;
export type ImportType = (typeof IMPORT_TYPES)[ImportPath];

/** Rejalashtirish konteksti. */
export interface ImportContext {
  /** Oxirgi CLOSED davr oyining oxirgi kuni (tarix importlari uchun). */
  lastClosedDay: string | null;
  /** Davrga bog'langan importda (PLANS, 7-bosqichda SALES) — OPEN davr (ensureOpenPeriod); aks holda null. */
  period: OpenPeriod | null;
}

/** Yozish konteksti: kim va qaysi batch (kpi_plans.import_batch_id, keyin sales_lines.import_batch_id). */
export interface ApplyContext {
  actorId: bigint;
  batchId: bigint;
}

export interface ImportPlan {
  outcomes: RowOutcome[];
  /** Rejani bazaga yozadi va audit yozuvlarini `audit` ga qo'shadi. Faqat hamma qator to'g'ri bo'lsa chaqiriladi. */
  apply(tx: Tx, ctx: ApplyContext, audit: AuditEntry[]): Promise<void>;
}

/** Bitta import turi: ustunlar va "bazadan holatni o'qib, qatorlarni rejalashtirish". */
export interface ImportKind {
  importType: ImportType;
  columns: ColumnSpec[];
  /**
   * true — davrga bog'langan import (PLANS, 7-bosqichda SALES): URL'da `?year=&month=` majburiy,
   * versiya raqami, file_hash va bitta ACTIVE — shu davr ichida (DECISIONS 4).
   * false — ma'lumotnoma importi (period_id = NULL).
   */
  periodic: boolean;
  plan(tx: Tx, rows: readonly SheetRow[], ctx: ImportContext): Promise<ImportPlan>;
}
