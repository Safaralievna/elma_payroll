import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction } from './audit-actions';
import { AuditQuery } from './audit.schemas';
import { AuditJson, sanitizeForAudit } from './sanitize';

export interface AuditEntry {
  /** Amalni bajargan foydalanuvchi; noma'lum bo'lsa (masalan, muvaffaqiyatsiz login) — null. */
  userId: bigint | null;
  action: AuditAction;
  /** Jadval nomi, masalan `users`. */
  entityType: string;
  entityId: bigint | null;
  oldData?: unknown;
  newData?: unknown;
}

export interface AuditLogView {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  createdAt: string;
}

export interface AuditPage {
  items: AuditLogView[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Audit jurnali: faqat yozish va o'qish. O'zgartirish/o'chirish metodi yo'q,
 * bazada esa trigger UPDATE/DELETE'ni to'sadi.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * `db` — asosiy o'zgarish bajarilayotgan tranzaksiya klienti. Audit o'sha
   * tranzaksiyada yoziladi: audit yozilmasa, o'zgarish ham bekor bo'ladi.
   */
  async log(db: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await db.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldData: toJsonColumn(entry.oldData),
        newData: toJsonColumn(entry.newData),
      },
    });
  }

  /** Ko'p yozuv (masalan, import) — bitta so'rovda, shu tranzaksiyada. */
  async logMany(db: Prisma.TransactionClient, entries: readonly AuditEntry[]): Promise<void> {
    for (let start = 0; start < entries.length; start += AUDIT_CHUNK) {
      await db.auditLog.createMany({
        data: entries.slice(start, start + AUDIT_CHUNK).map((entry) => ({
          userId: entry.userId,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          oldData: toJsonColumn(entry.oldData),
          newData: toJsonColumn(entry.newData),
        })),
      });
    }
  }

  async list(query: AuditQuery): Promise<AuditPage> {
    const where: Prisma.AuditLogWhereInput = {
      entityType: query.entityType,
      entityId: query.entityId,
      userId: query.userId,
      createdAt: query.from || query.to ? { gte: query.from, lte: query.to } : undefined,
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        include: { user: { select: { username: true } } },
        orderBy: { id: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: rows.map((row) => ({
        id: row.id.toString(),
        userId: row.userId?.toString() ?? null,
        username: row.user?.username ?? null,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId?.toString() ?? null,
        oldData: row.oldData,
        newData: row.newData,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}

const AUDIT_CHUNK = 1000;

/** Ma'lumot yo'q bo'lsa — ustun NULL bo'lib qoladi. */
function toJsonColumn(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const json: AuditJson = sanitizeForAudit(value);
  return json as Prisma.InputJsonValue;
}
