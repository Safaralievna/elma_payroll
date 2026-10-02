import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWorkbook } from '../src/imports/excel/workbook';
import { ImportPath } from '../src/imports/import-kind';
import { KINDS } from '../src/imports/imports.service';

/**
 * Ustun nomi → namuna qiymat. Sanalar YYYY-MM-DD. Faqat hujjat uchun: haqiqiy ma'lumot emas.
 * Seed'da bor kodlar (lavozim: SALES_REP, bog'lanish turi: SUPERVISOR) aynan shunday ishlatiladi.
 */
const SAMPLES: Record<ImportPath, Record<string, string | number>> = {
  employees: {
    xodim_kodi: 'E001',
    familiya: 'Aliyev',
    ism: 'Vali',
    otasining_ismi: 'Karimovich',
    ishga_kirgan_sana: '2025-01-15',
    ishdan_ketgan_sana: '',
    bolim_kodi: 'SAVDO',
    lavozim_kodi: 'SALES_REP',
    lavozim_sanasi: '2025-01-15',
    oylik: 3000000,
    oylik_sanasi: '2025-01-15',
  },
  'team-links': {
    rahbar_kodi: 'E010',
    xodim_kodi: 'E001',
    turi: 'SUPERVISOR',
    boshlanish_sanasi: '2025-01-15',
    tugash_sanasi: '',
  },
  products: { mahsulot_kodi: 'P001', nomi: 'Namuna mahsulot', guruh_kodi: 'G001' },
  clients: { mijoz_kodi: 'C001', nomi: 'Namuna mijoz', kategoriya_kodi: 'K001' },
};

/** Seed'da yo'q kodlar uchun katak izohi: import'dan oldin ma'lumotnomada bo'lishi kerak. */
const NOTES: Partial<Record<ImportPath, Record<string, string>>> = {
  employees: { bolim_kodi: 'avval /departments orqali yaratiladi' },
};

/** /imports/templates/:type bilan bir xil sarlavha + bitta namuna qator → docs/templates/<tur>-shablon.xlsx */
async function main(): Promise<void> {
  const outDir = join(__dirname, '..', '..', 'docs', 'templates');
  await mkdir(outDir, { recursive: true });
  for (const path of Object.keys(KINDS) as ImportPath[]) {
    const header = KINDS[path].columns.map((column) => column.name);
    const sample = SAMPLES[path];
    const row = header.map((name) => {
      if (!(name in sample)) throw new Error(`${path}: "${name}" ustuni uchun namuna yo'q — scripts/export-templates.ts ni yangilang`);
      return sample[name];
    });
    const file = join(outDir, `${path}-shablon.xlsx`);
    await writeFile(file, await buildWorkbook(header, [row], NOTES[path]));
    console.log(`yozildi: ${file}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
