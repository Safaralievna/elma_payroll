import { ImportFileError } from '../import-errors';
import { RawRow, SheetCell } from './workbook';

export interface ColumnSpec {
  name: string;
  /** Sarlavhada bo'lishi shartmi (katakchaning majburiyligi alohida tekshiriladi). */
  required: boolean;
}

export interface SheetRow {
  rowNumber: number;
  /** Ustun nomi → katakcha. Faylda bo'lmagan ixtiyoriy ustun — kalit yo'q. */
  values: Record<string, SheetCell>;
}

/**
 * Sarlavha (1-qator) bo'yicha ustunlarni topadi va qatorlarni nomli qiymatlarga aylantiradi.
 * Ustunlar tartibi muhim emas. Noma'lum, takrorlangan yoki yetishmayotgan majburiy
 * ustun — fayl xatosi: xato yozilgan ustun jim e'tiborsiz qolmasligi kerak.
 */
export function mapSheet(raw: readonly RawRow[], columns: readonly ColumnSpec[], maxRows: number): SheetRow[] {
  const [headerRow, ...dataRows] = raw;
  if (!headerRow || headerRow.rowNumber !== 1) {
    throw new ImportFileError("Sarlavha 1-qatorda bo'lishi kerak");
  }

  const known = new Set(columns.map((column) => column.name));
  const indexByName = new Map<string, number>();
  const unknown: string[] = [];
  const duplicates: string[] = [];
  headerRow.cells.forEach((cell, index) => {
    const name = cell === null ? '' : String(cell).trim().toLowerCase();
    if (name === '') return;
    if (!known.has(name)) unknown.push(name);
    else if (indexByName.has(name)) duplicates.push(name);
    else indexByName.set(name, index);
  });
  const missing = columns.filter((column) => column.required && !indexByName.has(column.name)).map((column) => column.name);

  if (unknown.length > 0 || duplicates.length > 0 || missing.length > 0) {
    const parts = [
      missing.length > 0 ? `majburiy ustun yo'q: ${missing.join(', ')}` : null,
      unknown.length > 0 ? `noma'lum ustun: ${unknown.join(', ')}` : null,
      duplicates.length > 0 ? `takrorlangan ustun: ${duplicates.join(', ')}` : null,
    ].filter(Boolean);
    throw new ImportFileError(`Sarlavha noto'g'ri — ${parts.join('; ')}`, {
      missing,
      unknown,
      duplicates,
      expected: columns.map((column) => column.name),
    });
  }

  const rows = dataRows.filter((row) => row.cells.some((cell) => !isBlank(cell)));
  if (rows.length === 0) throw new ImportFileError("Faylda ma'lumot qatori yo'q");
  if (rows.length > maxRows) {
    throw new ImportFileError(`Faylda qatorlar juda ko'p: ${rows.length} (ko'pi bilan ${maxRows})`);
  }

  return rows.map((row) => {
    const values: Record<string, SheetCell> = {};
    for (const [name, index] of indexByName) values[name] = row.cells[index] ?? null;
    return { rowNumber: row.rowNumber, values };
  });
}

export function isBlank(cell: SheetCell | undefined): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
}
