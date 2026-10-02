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

/** Ro'yxat (data validation) ko'pi bilan shu qatorgacha qo'yiladi (1-ma'lumot qatoridan boshlab). */
export const LIST_VALIDATION_ROWS = 1000;

export interface GuideSheet {
  name: string;
  header: readonly string[];
  rows: readonly (readonly string[])[];
  /** Jadvaldan keyin bo'sh qator qoldirib, A ustuniga yoziladigan matnlar. */
  footnotes?: readonly string[];
}

export interface WorkbookOptions {
  /** Ustun nomi → izoh: sarlavha katakchasiga Excel izohi (note) bo'lib qo'yiladi (ma'lumot qatori bo'sh bo'lishi mumkin). */
  notes?: Readonly<Record<string, string>>;
  /** Ustun nomi → ochiladigan ro'yxat qiymatlari (faqat shu qiymatlar kiritiladi). */
  lists?: Readonly<Record<string, readonly string[]>>;
  /** Ikkinchi varaq (yo'riqnoma). Import faqat birinchi varaqni o'qiydi. */
  guide?: GuideSheet;
}

/**
 * .xlsx: 1-varaqda 1-qator sarlavha (qalin, muzlatilgan), qolgani ma'lumot. Shablon va testlar uchun.
 * Ustun kengligi sarlavha va ma'lumot uzunligiga mos.
 */
export async function buildWorkbook(
  header: readonly string[],
  rows: readonly (readonly unknown[])[],
  options: WorkbookOptions = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Import', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow([...header]).font = { bold: true };
  for (const row of rows) sheet.addRow([...row]);

  header.forEach((name, index) => {
    const longest = Math.max(name.length, ...rows.map((row) => String(row[index] ?? '').length));
    sheet.getColumn(index + 1).width = longest + 3;
  });

  const columnOf = (name: string): number => {
    const index = header.indexOf(name);
    if (index === -1) throw new Error(`"${name}" ustuni sarlavhada yo'q`);
    return index + 1;
  };
  for (const [name, note] of Object.entries(options.notes ?? {})) {
    sheet.getCell(1, columnOf(name)).note = note;
  }
  for (const [name, values] of Object.entries(options.lists ?? {})) {
    const column = columnOf(name);
    for (let row = 2; row <= LIST_VALIDATION_ROWS + 1; row += 1) {
      sheet.getCell(row, column).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${values.join(',')}"`],
        showErrorMessage: true,
        errorTitle: "Noto'g'ri qiymat",
        error: `Ro'yxatdan tanlang: ${values.join(', ')}`,
      };
    }
  }

  if (options.guide) addGuideSheet(workbook, options.guide);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const GUIDE_MAX_COLUMN_WIDTH = 70;

function addGuideSheet(workbook: ExcelJS.Workbook, guide: GuideSheet): void {
  const sheet = workbook.addWorksheet(guide.name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow([...guide.header]).font = { bold: true };
  for (const row of guide.rows) sheet.addRow([...row]);
  guide.header.forEach((name, index) => {
    const longest = Math.max(name.length, ...guide.rows.map((row) => (row[index] ?? '').length));
    sheet.getColumn(index + 1).width = Math.min(longest + 3, GUIDE_MAX_COLUMN_WIDTH);
  });
  sheet.eachRow((row) => row.eachCell((cell) => (cell.alignment = { vertical: 'top', wrapText: true })));
  if (guide.footnotes?.length) {
    const first = guide.rows.length + 3;
    guide.footnotes.forEach((text, index) => {
      sheet.getCell(first + index, 1).value = text;
    });
  }
}
