import { AuditEntry } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { ColumnSpec, SheetRow } from './excel/sheet';
import { RowOutcome } from './plans/tracked-history';

export type Tx = Prisma.TransactionClient;

/** URL'dagi tur → import_batches.import_type. SALES va PLANS — keyingi bosqichlarda. */
export const IMPORT_TYPES = {
  employees: 'EMPLOYEES',
  'team-links': 'TEAM_LINKS',
  products: 'PRODUCTS',
  clients: 'CLIENTS',
} as const;
export type ImportPath = keyof typeof IMPORT_TYPES;
export type ImportType = (typeof IMPORT_TYPES)[ImportPath];

export interface ImportPlan {
  outcomes: RowOutcome[];
  /** Rejani bazaga yozadi va audit yozuvlarini `audit` ga qo'shadi. Faqat hamma qator to'g'ri bo'lsa chaqiriladi. */
  apply(tx: Tx, actorId: bigint, audit: AuditEntry[]): Promise<void>;
}

/** Bitta import turi: ustunlar va "bazadan holatni o'qib, qatorlarni rejalashtirish". */
export interface ImportKind {
  importType: ImportType;
  columns: ColumnSpec[];
  plan(tx: Tx, rows: readonly SheetRow[], lastClosedDay: string | null): Promise<ImportPlan>;
}
