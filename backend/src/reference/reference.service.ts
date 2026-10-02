import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { Page } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReferenceResource, ReferenceRow } from './reference.resources';

export type ReferenceView = Record<string, unknown> & { id: string };

export interface ReferenceListQuery {
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
  [filter: string]: unknown;
}

/**
 * Ma'lumotnomalar uchun umumiy CRUD. O'chirish yo'q — nofaol qilinadi
 * (savdo qatorlari, tarix va audit ularga bog'langan).
 */
@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(resource: ReferenceResource, query: ReferenceListQuery): Promise<Page<ReferenceView>> {
    const where: Record<string, unknown> = {};
    if (query.isActive !== undefined) where.isActive = query.isActive;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { name: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (resource.parent && query[resource.parent.field] !== undefined) {
      where[resource.parent.field] = query[resource.parent.field];
    }

    const delegate = resource.delegate(this.prisma);
    const [total, rows] = await Promise.all([
      delegate.count({ where }),
      delegate.findMany({
        where,
        include: include(resource),
        orderBy: { code: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map((row) => toView(resource, row)), total, page: query.page, pageSize: query.pageSize };
  }

  async get(resource: ReferenceResource, id: bigint): Promise<ReferenceView> {
    const row = await resource.delegate(this.prisma).findUnique({ where: { id }, include: include(resource) });
    if (!row) throw notFound(resource, id);
    return toView(resource, row);
  }

  async create(resource: ReferenceResource, actor: AuthUser, input: Record<string, unknown>): Promise<ReferenceView> {
    return this.prisma.$transaction(async (tx) => {
      const delegate = resource.delegate(tx);
      await ensureCodeFree(resource, tx, input.code as string);
      await checkParent(resource, tx, input);

      const row = await delegate.create({ data: input, include: include(resource) });
      const view = toView(resource, row);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'REFERENCE_CREATE',
        entityType: resource.table,
        entityId: row.id,
        newData: auditSnapshot(view),
      });
      return view;
    });
  }

  async update(
    resource: ReferenceResource,
    actor: AuthUser,
    id: bigint,
    input: Record<string, unknown>,
  ): Promise<ReferenceView> {
    return this.prisma.$transaction(async (tx) => {
      const delegate = resource.delegate(tx);
      const before = await delegate.findUnique({ where: { id }, include: include(resource) });
      if (!before) throw notFound(resource, id);
      if (input.code !== undefined && input.code !== before.code) await ensureCodeFree(resource, tx, input.code as string);
      if (resource.parent && input[resource.parent.field] !== before[resource.parent.field]) {
        await checkParent(resource, tx, input);
      }

      const row = await delegate.update({ where: { id }, data: input, include: include(resource) });
      const view = toView(resource, row);
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'REFERENCE_UPDATE',
        entityType: resource.table,
        entityId: id,
        oldData: auditSnapshot(toView(resource, before)),
        newData: auditSnapshot(view),
      });
      return view;
    });
  }
}

function include(resource: ReferenceResource): object | undefined {
  return resource.parent ? { [resource.parent.relation]: { select: { code: true } } } : undefined;
}

function toView(resource: ReferenceResource, row: ReferenceRow): ReferenceView {
  return {
    id: row.id.toString(),
    code: row.code,
    name: row.name,
    isActive: row.isActive,
    ...resource.extraView?.(row),
    ...(resource.hasTimestamps
      ? { createdAt: (row.createdAt as Date).toISOString(), updatedAt: (row.updatedAt as Date).toISOString() }
      : {}),
  };
}

/** Audit uchun: o'zgarishi mumkin bo'lgan maydonlar (id va vaqtlarsiz). */
function auditSnapshot(view: ReferenceView): Record<string, unknown> {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = view;
  return rest;
}

function notFound(resource: ReferenceResource, id: bigint): AppError {
  return new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${resource.label} topilmadi (id=${id})`);
}

async function ensureCodeFree(resource: ReferenceResource, tx: Prisma.TransactionClient, code: string): Promise<void> {
  if (await resource.delegate(tx).findUnique({ where: { code } })) {
    throw new AppError(HttpStatus.CONFLICT, 'CODE_TAKEN', `${resource.label} kodi band: ${code}`);
  }
}

/** Ota yozuv (guruh, kategoriya) mavjud va faol bo'lishi kerak. null — bog'lanishsiz. */
async function checkParent(
  resource: ReferenceResource,
  tx: Prisma.TransactionClient,
  input: Record<string, unknown>,
): Promise<void> {
  const link = resource.parent;
  const parentId = link ? (input[link.field] as bigint | null | undefined) : undefined;
  if (!link || parentId === undefined || parentId === null) return;
  const parent = await link.delegate(tx).findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new AppError(HttpStatus.NOT_FOUND, 'REFERENCE_NOT_FOUND', `${link.label} topilmadi (id=${parentId})`);
  }
  if (!parent.isActive) {
    throw new AppError(HttpStatus.CONFLICT, 'REFERENCE_INACTIVE', `${link.label} nofaol: ${parent.code ?? parent.name}`);
  }
}
