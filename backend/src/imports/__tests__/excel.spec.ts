import ExcelJS from 'exceljs';
import { ImportFileError } from '../import-errors';
import { RowReader } from '../excel/row-reader';
import { ColumnSpec, mapSheet } from '../excel/sheet';
import { buildWorkbook, RawRow, readFirstSheet } from '../excel/workbook';

const COLUMNS: ColumnSpec[] = [
  { name: 'xodim_kodi', required: true },
  { name: 'ism', required: false },
  { name: 'oylik', required: false },
];

function raw(rows: unknown[][]): RawRow[] {
  return rows.map((cells, index) => ({ rowNumber: index + 1, cells: cells as RawRow['cells'] }));
}

function expectFileError(fn: () => unknown, messagePart: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ImportFileError);
    expect((error as Error).message).toContain(messagePart);
    return;
  }
  throw new Error('ImportFileError kutilgan edi');
}

describe('readFirstSheet — .xlsx faylni katakchalarga aylantirish', () => {
  it('matn, son, sana, formula va rich text katakchalari; bo\'sh qatorlar tashlab ketiladi', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Xodimlar');
    sheet.addRow(['xodim_kodi', 'sana', 'summa']);
    sheet.addRow(['E001', new Date(Date.UTC(2026, 2, 1)), 1500000]);
    sheet.addRow([]);
    sheet.addRow([{ richText: [{ text: 'E0' }, { text: '02' }] }, '01.04.2026', { formula: '1+1', result: 2 }]);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const rows = await readFirstSheet(buffer);
    expect(rows).toEqual([
      { rowNumber: 1, cells: ['xodim_kodi', 'sana', 'summa'] },
      { rowNumber: 2, cells: ['E001', new Date(Date.UTC(2026, 2, 1)), 1500000] },
      { rowNumber: 4, cells: ['E002', '01.04.2026', 2] },
    ]);
  });

  it('Excel bo\'lmagan fayl — ImportFileError', async () => {
    await expect(readFirstSheet(Buffer.from('bu excel emas'))).rejects.toBeInstanceOf(ImportFileError);
  });

  it('buildWorkbook → readFirstSheet (shablon va testlar uchun)', async () => {
    const buffer = await buildWorkbook(['a', 'b'], [['x', 1]]);
    expect(await readFirstSheet(buffer)).toEqual([
      { rowNumber: 1, cells: ['a', 'b'] },
      { rowNumber: 2, cells: ['x', 1] },
    ]);
  });

  it('buildWorkbook: izoh (note) 1-ma\'lumot qatoriga qo\'yiladi, qiymatni o\'zgartirmaydi', async () => {
    const buffer = await buildWorkbook(['a', 'b'], [['x', 1]], { b: 'avval yaratiladi' });
    expect(await readFirstSheet(buffer)).toEqual([
      { rowNumber: 1, cells: ['a', 'b'] },
      { rowNumber: 2, cells: ['x', 1] },
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets[0]!.getCell('B2').note).toBe('avval yaratiladi');
  });
});

describe('mapSheet — sarlavha bo\'yicha ustunlarni topish', () => {
  it('ustunlar tartibi muhim emas, sarlavha katta-kichik harf va bo\'shliqlarga sezgir emas', () => {
    const rows = mapSheet(raw([[' Oylik ', 'XODIM_KODI'], [100, 'E1']]), COLUMNS, 10);
    expect(rows).toEqual([{ rowNumber: 2, values: { oylik: 100, xodim_kodi: 'E1' } }]);
  });

  it('majburiy ustun yo\'q — xato', () => {
    expectFileError(() => mapSheet(raw([['ism'], ['Ali']]), COLUMNS, 10), 'xodim_kodi');
  });

  it('noma\'lum ustun — xato (xato yozilgan ustun jim e\'tiborsiz qolmasin)', () => {
    expectFileError(() => mapSheet(raw([['xodim_kodi', 'oylk'], ['E1', 1]]), COLUMNS, 10), 'oylk');
  });

  it('takrorlangan ustun — xato', () => {
    expectFileError(() => mapSheet(raw([['xodim_kodi', 'ism', 'ism'], ['E1', 'a', 'b']]), COLUMNS, 10), 'ism');
  });

  it('sarlavha 1-qatorda bo\'lishi kerak; ma\'lumot qatori bo\'lmasa — xato', () => {
    expectFileError(() => mapSheet([{ rowNumber: 3, cells: ['xodim_kodi'] }], COLUMNS, 10), '1-qator');
    expectFileError(() => mapSheet(raw([['xodim_kodi']]), COLUMNS, 10), "qatori yo'q");
    expectFileError(() => mapSheet([], COLUMNS, 10), '1-qator');
  });

  it('qatorlar soni chegaradan oshsa — xato', () => {
    expectFileError(() => mapSheet(raw([['xodim_kodi'], ['E1'], ['E2'], ['E3']]), COLUMNS, 2), '2');
  });

  it('faqat bo\'sh/bo\'shliqli katakchalardan iborat qator tashlab ketiladi', () => {
    const rows = mapSheet(raw([['xodim_kodi', 'ism'], ['  ', null], ['E1', 'Ali']]), COLUMNS, 10);
    expect(rows.map((row) => row.rowNumber)).toEqual([3]);
  });
});

describe('RowReader — katakchalarni turga o\'girish va xatolarni to\'plash', () => {
  it('matn: bo\'shliqlar olinadi, son → satr, uzunlik tekshiriladi, bo\'sh → null', () => {
    const reader = new RowReader({ kod: ' E01 ', raqam: 1001, bosh: '  ', uzun: 'abcdef' });
    expect(reader.text('kod', { required: true, max: 50 })).toBe('E01');
    expect(reader.text('raqam', { required: true, max: 50 })).toBe('1001');
    expect(reader.text('bosh', { required: false, max: 50 })).toBeNull();
    expect(reader.text('uzun', { required: false, max: 5 })).toBeNull();
    expect(reader.text('yoq', { required: true, max: 5 })).toBeNull();
    expect(reader.errors).toEqual([
      { field: 'uzun', message: expect.stringContaining('5') },
      { field: 'yoq', message: expect.stringContaining('majburiy') },
    ]);
  });

  it('sana: Excel sanasi, YYYY-MM-DD va DD.MM.YYYY; noto\'g\'ri sana va formatlanmagan son — xato', () => {
    const reader = new RowReader({
      a: new Date(Date.UTC(2026, 2, 1)),
      b: '2026-04-15',
      c: '15.04.2026',
      d: '31.02.2026',
      e: 46082,
      f: 'ertaga',
    });
    expect(reader.date('a', { required: true })).toBe('2026-03-01');
    expect(reader.date('b', { required: true })).toBe('2026-04-15');
    expect(reader.date('c', { required: true })).toBe('2026-04-15');
    expect(reader.date('d', { required: true })).toBeNull();
    expect(reader.date('e', { required: true })).toBeNull();
    expect(reader.date('f', { required: true })).toBeNull();
    expect(reader.date('yoq', { required: false })).toBeNull();
    expect(reader.errors.map((error) => error.field)).toEqual(['d', 'e', 'f']);
  });

  it('summa: Decimal, ≥ 0, ko\'pi bilan 2 kasr; bo\'shliqli va vergulli matn qabul qilinadi', () => {
    const reader = new RowReader({
      a: 1500000,
      b: '1 500 000,50',
      c: '0.1',
      d: -5,
      e: '1.234',
      f: 'ko\'p',
      g: 0.1 + 0.2,
    });
    expect(reader.money('a', { required: true })?.toFixed(2)).toBe('1500000.00');
    expect(reader.money('b', { required: true })?.toFixed(2)).toBe('1500000.50');
    expect(reader.money('c', { required: true })?.toFixed(2)).toBe('0.10');
    expect(reader.money('d', { required: true })).toBeNull();
    expect(reader.money('e', { required: true })).toBeNull();
    expect(reader.money('f', { required: true })).toBeNull();
    // Float xatoligi (0.30000000000000004) jim yaxlitlanmaydi.
    expect(reader.money('g', { required: true })).toBeNull();
    expect(reader.errors.map((error) => error.field)).toEqual(['d', 'e', 'f', 'g']);
  });

  it('oneOf: katta-kichik harfga sezgir emas', () => {
    const reader = new RowReader({ a: 'supervisor', b: 'BOSS' });
    expect(reader.oneOf('a', ['SUPERVISOR', 'OPERATOR'], { required: true })).toBe('SUPERVISOR');
    expect(reader.oneOf('b', ['SUPERVISOR', 'OPERATOR'], { required: true })).toBeNull();
    expect(reader.errors).toEqual([{ field: 'b', message: expect.stringContaining('SUPERVISOR, OPERATOR') }]);
  });

  it('addError — qo\'shimcha (biznes) xatolar shu ro\'yxatga', () => {
    const reader = new RowReader({});
    reader.addError('bolim_kodi', 'Topilmadi');
    expect(reader.errors).toEqual([{ field: 'bolim_kodi', message: 'Topilmadi' }]);
  });
});
