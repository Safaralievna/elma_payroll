import { AuditEntry } from '../../audit/audit.service';
import { SheetRow } from '../excel/sheet';
import { ImportKind, ImportType, Tx } from '../import-kind';
import {
  CatalogImportContext,
  CatalogItemState,
  CLIENT_COLUMNS,
  planClientRows,
  planProductRows,
  PRODUCT_COLUMNS,
} from '../plans/catalog.plan';
import { RowOutcome } from '../plans/tracked-history';
import { codeMap, rowCodes } from './employees.import';

const CREATE_CHUNK = 1000;

interface CatalogTable {
  importType: ImportType;
  table: 'products' | 'clients';
  codeColumn: string;
  parentField: 'productGroupId' | 'clientCategoryId';
  parentCodeField: 'productGroupCode' | 'clientCategoryCode';
  planRows(rows: readonly SheetRow[], ctx: CatalogImportContext): RowOutcome[];
  loadItems(tx: Tx, codes: string[]): Promise<{ id: bigint; code: string; name: string; parentId: bigint | null; isActive: boolean }[]>;
  loadParents(tx: Tx): Promise<{ id: bigint; code: string | null; isActive: boolean }[]>;
  createMany(tx: Tx, items: CatalogItemState[]): Promise<{ id: bigint; code: string }[]>;
  update(tx: Tx, item: CatalogItemState): Promise<void>;
}

const PRODUCTS: CatalogTable = {
  importType: 'PRODUCTS',
  table: 'products',
  codeColumn: 'mahsulot_kodi',
  parentField: 'productGroupId',
  parentCodeField: 'productGroupCode',
  planRows: planProductRows,
  loadItems: async (tx, codes) =>
    (await tx.product.findMany({ where: { code: { in: codes } } })).map((row) => ({ ...row, parentId: row.productGroupId })),
  loadParents: (tx) => tx.productGroup.findMany({ select: { id: true, code: true, isActive: true } }),
  createMany: (tx, items) =>
    tx.product.createManyAndReturn({
      data: items.map((item) => ({ code: item.code, name: item.name, productGroupId: item.parentId as bigint })),
      select: { id: true, code: true },
    }),
  update: async (tx, item) => {
    await tx.product.update({ where: { id: item.id as bigint }, data: { name: item.name, productGroupId: item.parentId as bigint } });
  },
};

const CLIENTS: CatalogTable = {
  importType: 'CLIENTS',
  table: 'clients',
  codeColumn: 'mijoz_kodi',
  parentField: 'clientCategoryId',
  parentCodeField: 'clientCategoryCode',
  planRows: planClientRows,
  loadItems: async (tx, codes) =>
    (await tx.client.findMany({ where: { code: { in: codes } } })).map((row) => ({ ...row, parentId: row.clientCategoryId })),
  loadParents: (tx) => tx.clientCategory.findMany({ select: { id: true, code: true, isActive: true } }),
  createMany: (tx, items) =>
    tx.client.createManyAndReturn({
      data: items.map((item) => ({ code: item.code, name: item.name, clientCategoryId: item.parentId })),
      select: { id: true, code: true },
    }),
  update: async (tx, item) => {
    await tx.client.update({ where: { id: item.id as bigint }, data: { name: item.name, clientCategoryId: item.parentId } });
  },
};

/** PRODUCTS va CLIENTS: kod bo'yicha qo'shish/yangilash. Faylda yo'q yozuvlarga tegilmaydi. */
function catalogImport(spec: CatalogTable): ImportKind {
  return {
    importType: spec.importType,
    columns: spec.importType === 'PRODUCTS' ? PRODUCT_COLUMNS : CLIENT_COLUMNS,

    async plan(tx, rows) {
      const items = await spec.loadItems(tx, rowCodes(rows, spec.codeColumn));
      const parentRows = await spec.loadParents(tx);
      const parentCodes = new Map(parentRows.map((row) => [row.id, row.code]));
      const ctx: CatalogImportContext = {
        items: new Map(
          items.map((item) => [
            item.code,
            { id: item.id, code: item.code, name: item.name, parentId: item.parentId, original: { name: item.name, parentId: item.parentId } },
          ]),
        ),
        parents: await codeMap(Promise.resolve(parentRows)),
      };
      const outcomes = spec.planRows(rows, ctx);

      // Audit snapshot ma'lumotnoma API'dagi kabi (reference.resources.ts).
      const snapshot = (item: { code: string; name: string; parentId: bigint | null }, isActive: boolean) => ({
        code: item.code,
        name: item.name,
        isActive,
        [spec.parentField]: item.parentId?.toString() ?? null,
        [spec.parentCodeField]: item.parentId === null ? null : (parentCodes.get(item.parentId) ?? null),
      });

      return {
        outcomes,
        async apply(db: Tx, actorId: bigint, audit: AuditEntry[]) {
          const states = [...ctx.items.values()];
          const created = states.filter((item) => item.id === null);
          for (let start = 0; start < created.length; start += CREATE_CHUNK) {
            const chunk = created.slice(start, start + CREATE_CHUNK);
            const rowsCreated = await spec.createMany(db, chunk);
            const byCode = new Map(chunk.map((item) => [item.code, item]));
            for (const row of rowsCreated) {
              audit.push({
                userId: actorId,
                action: 'REFERENCE_CREATE',
                entityType: spec.table,
                entityId: row.id,
                newData: snapshot(byCode.get(row.code) as CatalogItemState, true),
              });
            }
          }

          const existing = new Map(items.map((item) => [item.id, item]));
          for (const item of states) {
            if (item.id === null || !item.original) continue;
            if (item.original.name === item.name && item.original.parentId === item.parentId) continue;
            await spec.update(db, item);
            const isActive = existing.get(item.id)?.isActive ?? true;
            audit.push({
              userId: actorId,
              action: 'REFERENCE_UPDATE',
              entityType: spec.table,
              entityId: item.id,
              oldData: snapshot({ code: item.code, ...item.original }, isActive),
              newData: snapshot(item, isActive),
            });
          }
        },
      };
    },
  };
}

export const PRODUCTS_IMPORT = catalogImport(PRODUCTS);
export const CLIENTS_IMPORT = catalogImport(CLIENTS);
