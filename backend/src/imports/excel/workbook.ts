import ExcelJS from 'exceljs';
import { ImportFileError } from '../import-errors';

/** Katakcha qiymati: formula natijasi, rich text va havolalar oddiy qiymatga keltiriladi. */
export type SheetCell = string | number | boolean | Date | null;

export interface RawRow {
  /** Excel'dagi qator raqami (1 dan) — xatolar shu raqam bilan ko'rsatiladi. */
  rowNumber: number;
  /** 0-indeks = A ustuni. */
  cells: SheetCell[];
}

/** .xlsx faylning birinchi varag'ini o'qiydi. Butunlay bo'sh qatorlar qaytarilmaydi. */
export async function readFirstSheet(buffer: Buffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs o'z Buffer turini kutadi — Node Buffer bilan bir xil.
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  } catch {
    throw new ImportFileError("Faylni o'qib bo'lmadi — u .xlsx formatida bo'lishi kerak");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportFileError("Faylda varaq yo'q");

  const rows: RawRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    const cells: SheetCell[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      cells.push(toSheetCell(row.getCell(column).value));
    }
    rows.push({ rowNumber, cells });
  });
  return rows;
}

function toSheetCell(value: ExcelJS.CellValue): SheetCell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date) {
    return value;
  }
  if ('richText' in value) return value.richText.map((part) => part.text).join('');
  if ('formula' in value || 'sharedFormula' in value) {
    const result = (value as ExcelJS.CellFormulaValue).result;
    if (result === undefined || result === null) return null;
    return typeof result === 'object' && 'error' in result ? result.error : result;
  }
  if ('hyperlink' in value) return String(value.text);
  if ('error' in value) return value.error;
  return null;
}

/** Bitta varaqli .xlsx: 1-qator sarlavha, qolgani ma'lumot. Shablon va testlar uchun. */
export async function buildWorkbook(header: readonly string[], rows: readonly (readonly unknown[])[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import');
  sheet.addRow([...header]).font = { bold: true };
  for (const row of rows) sheet.addRow([...row]);
  sheet.columns.forEach((column) => {
    column.width = 20;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
