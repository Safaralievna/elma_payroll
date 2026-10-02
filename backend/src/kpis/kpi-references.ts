import { HttpStatus } from '@nestjs/common';
import { AppError } from '../common/app-error';
import { Prisma } from '../generated/prisma/client';
import { FilterShape } from './kpi-config';

/**
 * Filtr qiymatlaridagi ID'lar (DECISIONS 2.2) — qaysi ma'lumotnomaga tegishli.
 * Yozishda: har bir ID bazada bor va faol bo'lishi kerak. O'qishda: kod va nom ko'rsatiladi.
 */

type Db = Prisma.TransactionClient;

export interface ReferenceInfo {
  id: string;
  code: string | null;
  name: string | null;
  isActive: boolean;
}

interface Source {
  label: string;
  load(db: Db, ids: bigint[]): Promise<ReferenceInfo[]>;
}

const select = { id: true, code: true, name: true, isActive: true } as const;
const plain = (rows: { id: bigint; code: string | null; name: string; isActive: boolean }[]): ReferenceInfo[] =>
  rows.map((row) => ({ id: row.id.toString(), code: row.code, name: row.name, isActive: row.isActive }));

const SOURCES: Record<string, Source> = {
  product_id: { label: 'Mahsulot', load: async (db, ids) => plain(await db.product.findMany({ where: { id: { in: ids } }, select })) },
  product_group_id: {
    label: 'Mahsulot guruhi',
    load: async (db, ids) => plain(await db.productGroup.findMany({ where: { id: { in: ids } }, select })),
  },
  client_id: { label: 'Mijoz', load: async (db, ids) => plain(await db.client.findMany({ where: { id: { in: ids } }, select })) },
  client_category_id: {
    label: 'Mijoz kategoriyasi',
    load: async (db, ids) => plain(await db.clientCategory.findMany({ where: { id: { in: ids } }, select })),
  },
  price_type_id: {
    label: 'Narx turi',
    load: async (db, ids) => plain(await db.priceType.findMany({ where: { id: { in: ids } }, select })),
  },
  employee_id: {
    label: 'Xodim',
    load: async (db, ids) =>
      (
        await db.employee.findMany({
          where: { id: { in: ids } },
          select: { id: true, employeeCode: true, firstName: true, lastName: true, isActive: true },
        })
      ).map((row) => ({
        id: row.id.toString(),
        code: row.employeeCode,
        name: [row.lastName, row.firstName].filter(Boolean).join(' ') || null,
        isActive: row.isActive,
      })),
  },
};

export function referenceKey(fieldName: string, id: string): string {
  return `${fieldName}:${id}`;
}

/** Filtrlardagi hamma ID'lar → Map("product_id:5" → ma'lumot). Har bir maydon uchun bitta so'rov. */
export async function loadReferences(db: Db, filters: readonly FilterShape[]): Promise<Map<string, ReferenceInfo>> {
  const idsByField = new Map<string, Set<string>>();
  for (const filter of filters) {
    if (!SOURCES[filter.fieldName]) continue;
    const ids = idsByField.get(filter.fieldName) ?? new Set<string>();
    filter.values.filter((value) => /^\d{1,18}$/.test(value)).forEach((value) => ids.add(value));
    idsByField.set(filter.fieldName, ids);
  }

  const result = new Map<string, ReferenceInfo>();
  for (const [fieldName, ids] of idsByField) {
    if (ids.size === 0) continue;
    for (const info of await SOURCES[fieldName].load(db, [...ids].map((id) => BigInt(id)))) {
      result.set(referenceKey(fieldName, info.id), info);
    }
  }
  return result;
}

/** Yangi/o'zgargan qoida filtrlari: ID yo'q — 404 REFERENCE_NOT_FOUND, nofaol — 409 REFERENCE_INACTIVE. */
export async function requireReferences(db: Db, filters: readonly FilterShape[]): Promise<void> {
  const found = await loadReferences(db, filters);
  for (const filter of filters) {
    const source = SOURCES[filter.fieldName];
    if (!source) continue;
    for (const id of filter.values) {
      const info = found.get(referenceKey(filter.fieldName, id));
      if (!info) {
        throw new AppError(HttpStatus.NOT_FOUND, 'REFERENCE_NOT_FOUND', `${source.label} topilmadi (id=${id})`, {
          fieldName: filter.fieldName,
          id,
        });
      }
      if (!info.isActive) {
        throw new AppError(
          HttpStatus.CONFLICT,
          'REFERENCE_INACTIVE',
          `${source.label} nofaol: ${info.code ?? info.name ?? id} — filtrda ishlatib bo'lmaydi`,
          { fieldName: filter.fieldName, id },
        );
      }
    }
  }
}
