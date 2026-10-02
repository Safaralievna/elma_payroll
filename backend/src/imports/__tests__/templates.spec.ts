import ExcelJS from 'exceljs';
import { mapSheet } from '../excel/sheet';
import { readFirstSheet } from '../excel/workbook';
import { buildImportTemplate, GUIDE_HEADER, GUIDE_SHEET_NAME } from '../import-templates';
import { ImportPath } from '../import-kind';
import { IMPORT_MAX_ROWS } from '../import.constants';
import { KINDS } from '../imports.service';

const IMPORT_PATHS = Object.keys(KINDS) as ImportPath[];

async function load(path: ImportPath): Promise<{ buffer: Buffer; book: ExcelJS.Workbook }> {
  const buffer = await buildImportTemplate(path, KINDS[path].columns);
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return { buffer, book };
}

describe.each(IMPORT_PATHS)('shablon: %s', (path) => {
  const header = KINDS[path].columns.map((column) => column.name);

  it("1-varaq: faqat sarlavha (import ustunlari bilan bir xil), namuna qator yo'q; import uni «ma'lumot yo'q» deb qaytaradi", async () => {
    const { buffer } = await load(path);
    const raw = await readFirstSheet(buffer);
    expect(raw).toEqual([{ rowNumber: 1, cells: header }]);
    expect(() => mapSheet(raw, KINDS[path].columns, IMPORT_MAX_ROWS)).toThrow("Faylda ma'lumot qatori yo'q");
  });

  it("2-varaq «Yo'riqnoma»: ustun | majburiymi | format | misol, har bir ustun uchun bitta qator", async () => {
    const { book } = await load(path);
    expect(book.worksheets).toHaveLength(2);
    const guide = book.worksheets[1]!;
    expect(guide.name).toBe(GUIDE_SHEET_NAME);
    expect(guide.getRow(1).values).toEqual([undefined, ...GUIDE_HEADER]);
    header.forEach((name, index) => {
      const row = guide.getRow(index + 2);
      expect(row.getCell(1).value).toBe(name);
      expect(String(row.getCell(2).value)).not.toBe('');
      expect(String(row.getCell(3).value)).not.toBe('');
      expect(String(row.getCell(4).value)).not.toBe(''); // misol har bir ustun uchun bor
    });
  });

  it('import faqat birinchi varaqni o\'qiydi: Yo\'riqnoma varag\'i qatorlari ma\'lumot bo\'lib o\'tmaydi', async () => {
    const { buffer } = await load(path);
    const raw = await readFirstSheet(buffer);
    const guideNames = new Set(['ustun', 'majburiymi', 'format', 'misol']);
    for (const row of raw) expect(row.cells.some((cell) => guideNames.has(String(cell)))).toBe(false);
    expect(raw).toHaveLength(1);
  });

  it('sarlavha qalin va muzlatilgan; ustun kengligi sarlavhaga mos', async () => {
    const { book } = await load(path);
    const sheet = book.worksheets[0]!;
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    header.forEach((name, index) => {
      expect(sheet.getCell(1, index + 1).font?.bold).toBe(true);
      expect(sheet.getColumn(index + 1).width).toBeGreaterThanOrEqual(name.length);
    });
  });
});

describe("shablon: izohlar, misollar va ro'yxatlar", () => {
  it("employees: misollar yo'riqnomada; lavozim_sanasi va oylik_sanasi — oyning 1-kuni; bo'lim izohi sarlavhada", async () => {
    const { book } = await load('employees');
    const [sheet, guide] = book.worksheets as [ExcelJS.Worksheet, ExcelJS.Worksheet];
    const example = (name: string) => guide.getRow(KINDS.employees.columns.findIndex((c) => c.name === name) + 2).getCell(4).value;
    expect(example('lavozim_sanasi')).toBe('2026-02-01');
    expect(example('oylik_sanasi')).toBe('2026-02-01');
    expect(example('lavozim_kodi')).toBe('SALES_REP');
    const bolim = KINDS.employees.columns.findIndex((c) => c.name === 'bolim_kodi') + 1;
    expect(sheet.getCell(1, bolim).note).toBe("Bu bo'lim avval tizimda yaratilgan bo'lishi kerak (Ma'lumotnomalar → Bo'limlar)");
    expect(sheet.actualRowCount).toBe(1); // ro'yxatli bo'sh katakchalar rowCount'ni oshiradi, ma'lumot qatori emas
  });

  it('products va clients: guruh va kategoriya uchun izoh sarlavhada', async () => {
    const products = (await load('products')).book.worksheets[0]!;
    expect(products.getCell('C1').note).toBe(
      "Bu mahsulot guruhi avval tizimda yaratilgan bo'lishi kerak (Ma'lumotnomalar → Mahsulot guruhlari)",
    );
    const clients = (await load('clients')).book.worksheets[0]!;
    expect(clients.getCell('C1').note).toBe(
      "Bu mijoz kategoriyasi avval tizimda yaratilgan bo'lishi kerak (Ma'lumotnomalar → Mijoz kategoriyalari)",
    );
  });

  it("team-links: «turi» ustunida SUPERVISOR / OPERATOR ochiladigan ro'yxati", async () => {
    const sheet = (await load('team-links')).book.worksheets[0]!;
    const column = KINDS['team-links'].columns.findIndex((c) => c.name === 'turi') + 1;
    for (const row of [2, 3, 500]) {
      expect(sheet.getCell(row, column).dataValidation).toMatchObject({
        type: 'list',
        formulae: ['"SUPERVISOR,OPERATOR"'],
        showErrorMessage: true,
      });
    }
    expect(sheet.getCell(2, 1).dataValidation).toBeFalsy();
  });
});
