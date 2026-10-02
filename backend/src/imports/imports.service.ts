import { HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { AuditEntry, AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { dateToIso } from '../common/iso-date';
import { Page } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';
import { lastClosedDay } from '../history/history-db';
import { PrismaService } from '../prisma/prisma.service';
import { SheetRow, mapSheet } from './excel/sheet';
import { buildWorkbook, readFirstSheet } from './excel/workbook';
import { ImportFileError } from './import-errors';
import { IMPORT_TYPES, ImportKind, ImportPath, Tx } from './import-kind';
import {
  IMPORT_ERRORS_IN_RESPONSE,
  IMPORT_MAX_ROWS,
  IMPORT_TRANSACTION_TIMEOUT_MS,
} from './import.constants';
import { CLIENTS_IMPORT, PRODUCTS_IMPORT } from './kinds/catalog.import';
import { EMPLOYEES_IMPORT } from './kinds/employees.import';
import { TEAM_LINKS_IMPORT } from './kinds/team-links.import';
import { Outcome, RowOutcome } from './plans/tracked-history';

const KINDS: Record<ImportPath, ImportKind> = {
  employees: EMPLOYEES_IMPORT,
  'team-links': TEAM_LINKS_IMPORT,
  products: PRODUCTS_IMPORT,
  clients: CLIENTS_IMPORT,
};

const ROW_CHUNK = 1000;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface BatchView {
  id: string;
  importType: string;
  versionNumber: number;
  status: string;
  fileName: string;
  fileHash: string;
  importedBy: string;
  importedByUsername: string;
  importedAt: string;
  rowCount: number;
  invalidRowCount: number;
}

export interface ImportResult extends BatchView {
  created: number;
  updated: number;
  unchanged: number;
}

export interface ImportErrorView {
  rowNumber: number;
  employeeCode: string | null;
  field: string | null;
  message: string;
}

/**
 * Ma'lumotnoma importlari (DECISIONS 4). Davrga bog'lanmaydi (period_id = NULL).
 *
 * - Fayl xatosi (Excel emas, sarlavha, > 50 000 qator) — 400 INVALID_FILE, batch yaratilmaydi.
 * - Bir xil fayl (SHA-256) shu turda bor bo'lsa — 409 FILE_ALREADY_IMPORTED.
 * - Bitta qator xato bo'lsa ham — batch INVALID, qatorlar va xatolar saqlanadi,
 *   ma'lumotga hech narsa yozilmaydi, javob 422 IMPORT_HAS_ERRORS.
 * - Hammasi to'g'ri — bitta tranzaksiyada: oldingi ACTIVE → ARCHIVED, yangi batch ACTIVE,
 *   o'zgarishlar qo'llanadi, audit yoziladi.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async upload(actor: AuthUser, path: ImportPath, file: UploadedFile | undefined): Promise<ImportResult> {
    const kind = KINDS[path];
    if (!file) throw invalidFile('Fayl yuborilmadi ("file" maydoni)');
    // multer fayl nomini latin1 deb o'qiydi — o'zbekcha/kirillcha nomlar buzilmasin.
    const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 255);
    if (!fileName.toLowerCase().endsWith('.xlsx')) throw invalidFile('Faqat .xlsx fayl qabul qilinadi');

    let rows: SheetRow[];
    try {
      rows = mapSheet(await readFirstSheet(file.buffer), kind.columns, IMPORT_MAX_ROWS);
    } catch (error) {
      if (error instanceof ImportFileError) throw invalidFile(error.message, error.details);
      throw error;
    }
    const fileHash = createHash('sha256').update(file.buffer).digest('hex');

    const result = await this.prisma.$transaction(
      async (tx) => {
        // Bir turdagi importlar ketma-ket: versiya raqami va ACTIVE almashuvi to'qnashmasin.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import:${kind.importType}`}))`;

        const duplicate = await tx.importBatch.findFirst({ where: { periodId: null, importType: kind.importType, fileHash } });
        if (duplicate) throw alreadyImported(duplicate.id, duplicate.status);

        const last = await tx.importBatch.aggregate({
          where: { periodId: null, importType: kind.importType },
          _max: { versionNumber: true },
        });
        const versionNumber = (last._max.versionNumber ?? 0) + 1;

        const plan = await kind.plan(tx, rows, await lastClosedDay(tx));
        const errors = collectErrors(plan.outcomes);
        const invalid = errors.length > 0;

        if (!invalid) {
          await tx.importBatch.updateMany({
            where: { periodId: null, importType: kind.importType, status: 'ACTIVE' },
            data: { status: 'ARCHIVED' },
          });
        }
        const batch = await tx.importBatch.create({
          data: {
            periodId: null,
            fileName,
            fileHash,
            importType: kind.importType,
            versionNumber,
            status: invalid ? 'INVALID' : 'ACTIVE',
            importedBy: actor.id,
          },
        });
        await saveRows(tx, batch.id, rows, plan.outcomes);

        const audit: AuditEntry[] = [];
        if (!invalid) await plan.apply(tx, actor.id, audit);
        const counts = countOutcomes(plan.outcomes);
        audit.push({
          userId: actor.id,
          action: invalid ? 'IMPORT_INVALID' : 'IMPORT_APPLY',
          entityType: 'import_batches',
          entityId: batch.id,
          newData: { importType: kind.importType, fileName, versionNumber, rowCount: rows.length, errorCount: errors.length, ...counts },
        });
        await this.audit.logMany(tx, audit);
        return { batchId: batch.id, errors, counts };
      },
      { timeout: IMPORT_TRANSACTION_TIMEOUT_MS, maxWait: 10_000 },
    );

    if (result.errors.length > 0) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'IMPORT_HAS_ERRORS',
        `Faylda ${result.errors.length} ta xato topildi — hech narsa o'zgartirilmadi. Xatolarni tuzatib, qayta yuklang`,
        {
          batchId: result.batchId.toString(),
          errorCount: result.errors.length,
          errors: result.errors.slice(0, IMPORT_ERRORS_IN_RESPONSE),
        },
      );
    }
    return { ...(await this.get(result.batchId)), ...result.counts };
  }

  async list(query: { type?: ImportPath; page: number; pageSize: number }): Promise<Page<BatchView>> {
    const where: Prisma.ImportBatchWhereInput = {
      periodId: null,
      importType: query.type ? IMPORT_TYPES[query.type] : { in: Object.values(IMPORT_TYPES) },
    };
    const [total, batches] = await Promise.all([
      this.prisma.importBatch.count({ where }),
      this.prisma.importBatch.findMany({
        where,
        include: { importedByUser: { select: { username: true } } },
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const counts = await this.rowCounts(batches.map((batch) => batch.id));
    return {
      items: batches.map((batch) => toBatchView(batch, counts.get(batch.id))),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: bigint): Promise<BatchView> {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: { importedByUser: { select: { username: true } } },
    });
    if (!batch) throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Import topilmadi (id=${id})`);
    return toBatchView(batch, (await this.rowCounts([id])).get(id));
  }

  async errors(id: bigint, page: number, pageSize: number): Promise<Page<ImportErrorView>> {
    await this.get(id);
    const where: Prisma.ValidationErrorWhereInput = { importRow: { batchId: id } };
    const [total, rows] = await Promise.all([
      this.prisma.validationError.count({ where }),
      this.prisma.validationError.findMany({
        where,
        include: { importRow: { select: { rowNumber: true, employeeId: true } } },
        orderBy: [{ importRow: { rowNumber: 'asc' } }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: rows.map((row) => ({
        rowNumber: row.importRow.rowNumber,
        employeeCode: row.importRow.employeeId,
        field: row.fieldName,
        message: row.errorMessage,
      })),
      total,
      page,
      pageSize,
    };
  }

  /** Bo'sh shablon: faqat sarlavha qatori. */
  template(path: ImportPath): Promise<Buffer> {
    return buildWorkbook(
      KINDS[path].columns.map((column) => column.name),
      [],
    );
  }

  private async rowCounts(batchIds: bigint[]): Promise<Map<bigint, { rowCount: number; invalidRowCount: number }>> {
    const groups = await this.prisma.importRow.groupBy({
      by: ['batchId', 'isValid'],
      where: { batchId: { in: batchIds } },
      _count: { _all: true },
    });
    const counts = new Map<bigint, { rowCount: number; invalidRowCount: number }>();
    for (const group of groups) {
      const entry = counts.get(group.batchId) ?? { rowCount: 0, invalidRowCount: 0 };
      entry.rowCount += group._count._all;
      if (!group.isValid) entry.invalidRowCount += group._count._all;
      counts.set(group.batchId, entry);
    }
    return counts;
  }
}

function invalidFile(message: string, details?: unknown): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, 'INVALID_FILE', message, details);
}

function alreadyImported(batchId: bigint, status: string): AppError {
  const message =
    status === 'INVALID'
      ? `Bu fayl avval yuklangan va xato deb topilgan (batch #${batchId}) — xatolarni tuzatib, faylni qayta yuklang`
      : `Bu fayl allaqachon yuklangan (batch #${batchId})`;
  return new AppError(HttpStatus.CONFLICT, 'FILE_ALREADY_IMPORTED', message, { batchId: batchId.toString(), status });
}

function collectErrors(outcomes: readonly RowOutcome[]): ImportErrorView[] {
  return outcomes.flatMap((outcome) =>
    outcome.errors.map((error) => ({
      rowNumber: outcome.rowNumber,
      employeeCode: outcome.employeeCode,
      field: error.field,
      message: error.message,
    })),
  );
}

function countOutcomes(outcomes: readonly RowOutcome[]): Record<'created' | 'updated' | 'unchanged', number> {
  const count = (outcome: Outcome) => outcomes.filter((item) => item.outcome === outcome).length;
  return { created: count('CREATED'), updated: count('UPDATED'), unchanged: count('UNCHANGED') };
}

/** import_rows (har bir qator, asl qiymatlari bilan) va validation_errors. */
async function saveRows(tx: Tx, batchId: bigint, rows: readonly SheetRow[], outcomes: readonly RowOutcome[]): Promise<void> {
  const outcomeByRow = new Map(outcomes.map((outcome) => [outcome.rowNumber, outcome]));
  for (let start = 0; start < rows.length; start += ROW_CHUNK) {
    const chunk = rows.slice(start, start + ROW_CHUNK);
    const created = await tx.importRow.createManyAndReturn({
      data: chunk.map((row) => {
        const outcome = outcomeByRow.get(row.rowNumber);
        return {
          batchId,
          rowNumber: row.rowNumber,
          employeeId: outcome?.employeeCode ?? null,
          rawData: toRawJson(row.values),
          isValid: (outcome?.errors.length ?? 0) === 0,
        };
      }),
      select: { id: true, rowNumber: true },
    });
    const errors = created.flatMap((row) =>
      (outcomeByRow.get(row.rowNumber)?.errors ?? []).map((error) => ({
        importRowId: row.id,
        fieldName: error.field,
        errorMessage: error.message,
      })),
    );
    if (errors.length > 0) await tx.validationError.createMany({ data: errors });
  }
}

/** Katakchalar JSON uchun: sana → "YYYY-MM-DD", qolganlari o'zgarishsiz. */
function toRawJson(values: SheetRow['values']): Prisma.InputJsonObject {
  const json: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(values)) json[key] = value instanceof Date ? dateToIso(value) : value;
  return json;
}

function toBatchView(
  batch: Prisma.ImportBatchGetPayload<{ include: { importedByUser: { select: { username: true } } } }>,
  counts: { rowCount: number; invalidRowCount: number } | undefined,
): BatchView {
  return {
    id: batch.id.toString(),
    importType: batch.importType,
    versionNumber: batch.versionNumber,
    status: batch.status,
    fileName: batch.fileName,
    fileHash: batch.fileHash,
    importedBy: batch.importedBy.toString(),
    importedByUsername: batch.importedByUser.username,
    importedAt: batch.importedAt.toISOString(),
    rowCount: counts?.rowCount ?? 0,
    invalidRowCount: counts?.invalidRowCount ?? 0,
  };
}
