import { RowReader } from '../excel/row-reader';
import { ColumnSpec, SheetRow } from '../excel/sheet';
import { failed, requireActive } from './employees.plan';
import { duplicatedCodes, RefEntry, RowOutcome } from './tracked-history';

export const PRODUCT_COLUMNS: ColumnSpec[] = [
  { name: 'mahsulot_kodi', required: true },
  { name: 'nomi', required: true },
  { name: 'guruh_kodi', required: true },
];

export const CLIENT_COLUMNS: ColumnSpec[] = [
  { name: 'mijoz_kodi', required: true },
  { name: 'nomi', required: true },
  { name: 'kategoriya_kodi', required: false },
];

/** Mahsulot yoki mijoz: kod, nom va ota yozuv (mahsulot guruhi / mijoz kategoriyasi). */
export interface CatalogItemState {
  /** null — import yaratadi. */
  id: bigint | null;
  code: string;
  name: string;
  parentId: bigint | null;
  original: { name: string; parentId: bigint | null } | null;
}

export interface CatalogImportContext {
  /** Kod → holat. Reja shu obyektlarni o'zgartiradi va yangilarini qo'shadi. */
  items: Map<string, CatalogItemState>;
  /** Guruh yoki kategoriya kodi → id. */
  parents: Map<string, RefEntry>;
}

interface CatalogSpec {
  codeColumn: string;
  parentColumn: string;
  parentLabel: string;
  parentRequired: boolean;
}

const PRODUCT_SPEC: CatalogSpec = {
  codeColumn: 'mahsulot_kodi',
  parentColumn: 'guruh_kodi',
  parentLabel: 'Mahsulot guruhi',
  parentRequired: true,
};

const CLIENT_SPEC: CatalogSpec = {
  codeColumn: 'mijoz_kodi',
  parentColumn: 'kategoriya_kodi',
  parentLabel: 'Mijoz kategoriyasi',
  parentRequired: false,
};

export function planProductRows(rows: readonly SheetRow[], ctx: CatalogImportContext): RowOutcome[] {
  return planCatalogRows(rows, ctx, PRODUCT_SPEC);
}

export function planClientRows(rows: readonly SheetRow[], ctx: CatalogImportContext): RowOutcome[] {
  return planCatalogRows(rows, ctx, CLIENT_SPEC);
}

/** Kod bo'yicha qo'shish yoki yangilash. Bo'sh ixtiyoriy katakcha mavjud qiymatni o'zgartirmaydi. */
function planCatalogRows(rows: readonly SheetRow[], ctx: CatalogImportContext, spec: CatalogSpec): RowOutcome[] {
  const duplicates = duplicatedCodes(rows.map((row) => new RowReader(row.values).text(spec.codeColumn, { required: false, max: 50 })));

  return rows.map((row) => {
    const r = new RowReader(row.values);
    const code = r.text(spec.codeColumn, { required: true, max: 50 });
    const name = r.text('nomi', { required: true, max: 200 });
    const parentCode = r.text(spec.parentColumn, { required: spec.parentRequired, max: 50 });
    const parent = parentCode === null ? null : (ctx.parents.get(parentCode) ?? null);
    if (parentCode !== null && !parent) r.addError(spec.parentColumn, `${spec.parentLabel} topilmadi: ${parentCode}`);
    if (code !== null && duplicates.has(code)) r.addError(spec.codeColumn, `Kod faylda bir necha marta uchraydi: ${code}`);
    if (code === null || name === null || r.errors.length > 0) return failed(row, null, r);

    const existing = ctx.items.get(code);
    const parentId = parent ? parent.id : (existing?.parentId ?? null);
    const parentChanged = parent !== null && parent.id !== existing?.parentId;
    if (parent && (!existing || parentChanged)) requireActive(r, spec.parentColumn, parent, spec.parentLabel);
    if (r.errors.length > 0) return failed(row, null, r);

    if (!existing) {
      ctx.items.set(code, { id: null, code, name, parentId, original: null });
      return { rowNumber: row.rowNumber, employeeCode: null, outcome: 'CREATED', errors: [] };
    }
    const changed = existing.name !== name || existing.parentId !== parentId;
    existing.name = name;
    existing.parentId = parentId;
    return { rowNumber: row.rowNumber, employeeCode: null, outcome: changed ? 'UPDATED' : 'UNCHANGED', errors: [] };
  });
}
