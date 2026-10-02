import { TEAM_LINK_TYPES } from '../team-links/team-link-types';
import { ColumnSpec } from './excel/sheet';
import { buildWorkbook } from './excel/workbook';
import { ImportPath } from './import-kind';

export const GUIDE_SHEET_NAME = "Yo'riqnoma";
export const GUIDE_HEADER = ['ustun', 'majburiymi', 'format', 'misol'] as const;

/** Shablon bitta ustuni: yo'riqnoma matni + namuna qiymat (+ izoh va ro'yxat). */
interface ColumnDoc {
  required: string;
  format: string;
  /** 2-qatordagi namuna katakcha. Haqiqiy ma'lumot emas, faqat hujjat uchun. */
  sample: string | number;
  /** Yo'riqnomadagi "misol" (berilmasa — `sample`). Namuna katakcha bo'sh bo'lganda kerak. */
  example?: string;
  /** Namuna katakchaga Excel izohi. */
  note?: string;
  /** Ochiladigan ro'yxat qiymatlari. */
  list?: readonly string[];
}

const DATE = 'Sana: YYYY-MM-DD yoki DD.MM.YYYY';
const MONTH_START = "faqat oyning 1-kuni (masalan 2025-02-01)";
const NO = "Yo'q";
const YES = 'Ha';

const referenceNote = (what: string, where: string): string =>
  `Bu ${what} avval tizimda yaratilgan bo'lishi kerak (Ma'lumotnomalar → ${where})`;

/**
 * Hamma shablonlarning yagona manbai: GET /imports/templates/:type va `npm run templates:export`.
 * Seed'dagi kodlar haqiqiy (lavozim SALES_REP); seed'da yo'q kodlar (bo'lim, guruh, kategoriya)
 * izohda "avval yaratiladi" deb belgilangan. Namuna qator import'dan o'tishi test bilan tekshiriladi
 * (test/db/templates.db-spec.ts).
 */
const DOCS: Record<ImportPath, Record<string, ColumnDoc>> = {
  employees: {
    xodim_kodi: { required: YES, format: "Matn, ko'pi bilan 50 belgi. Xodim faqat shu kod bilan aniqlanadi", sample: 'E001' },
    familiya: { required: NO, format: "Matn, ko'pi bilan 100 belgi", sample: 'Aliyev' },
    ism: { required: NO, format: "Matn, ko'pi bilan 100 belgi", sample: 'Vali' },
    otasining_ismi: { required: NO, format: "Matn, ko'pi bilan 100 belgi", sample: 'Karimovich' },
    ishga_kirgan_sana: { required: NO, format: `${DATE}; istalgan kun`, sample: '2025-01-15' },
    ishdan_ketgan_sana: { required: NO, format: `${DATE}; istalgan kun. Ishdan ketmagan bo'lsa — bo'sh qoldiring`, sample: '', example: '2025-12-31' },
    bolim_kodi: {
      required: "Lavozim berilsa — ha",
      format: "Bo'lim kodi (Ma'lumotnomalar → Bo'limlar). bolim_kodi, lavozim_kodi va lavozim_sanasi birga to'ldiriladi",
      sample: 'SAVDO',
      note: referenceNote("bo'lim", "Bo'limlar"),
    },
    lavozim_kodi: {
      required: 'Lavozim berilsa — ha',
      format: 'Lavozim kodi: SALES_REP, SUPERVISOR, OPERATOR yoki EXPEDITOR',
      sample: 'SALES_REP',
    },
    lavozim_sanasi: { required: 'Lavozim berilsa — ha', format: `${DATE}; ${MONTH_START}`, sample: '2025-02-01' },
    oylik: {
      required: 'Oylik berilsa — ha',
      format: "Son, so'mda; kasr ko'pi bilan 2 belgi. Minglik bo'shliq mumkin (3 000 000)",
      sample: 3000000,
    },
    oylik_sanasi: { required: 'Oylik berilsa — ha', format: `${DATE}; ${MONTH_START}`, sample: '2025-02-01' },
  },
  'team-links': {
    rahbar_kodi: { required: YES, format: 'Rahbarning xodim kodi (tizimda bor xodim)', sample: 'E010' },
    xodim_kodi: { required: YES, format: "Bo'ysunuvchi xodimning kodi (tizimda bor xodim)", sample: 'E001' },
    turi: { required: YES, format: "Ro'yxatdan tanlang: SUPERVISOR (supervayzer) yoki OPERATOR", sample: 'SUPERVISOR', list: TEAM_LINK_TYPES },
    boshlanish_sanasi: { required: YES, format: `${DATE}; istalgan kun`, sample: '2025-01-15' },
    tugash_sanasi: { required: NO, format: `${DATE}; hozir ham amal qilsa — bo'sh qoldiring`, sample: '', example: '2025-12-31' },
  },
  products: {
    mahsulot_kodi: { required: YES, format: "Matn, ko'pi bilan 50 belgi", sample: 'P001' },
    nomi: { required: YES, format: "Matn, ko'pi bilan 200 belgi", sample: 'Namuna mahsulot' },
    guruh_kodi: { required: YES, format: "Mahsulot guruhi kodi (Ma'lumotnomalar → Mahsulot guruhlari)", sample: 'G001', note: referenceNote('mahsulot guruhi', 'Mahsulot guruhlari') },
  },
  clients: {
    mijoz_kodi: { required: YES, format: "Matn, ko'pi bilan 50 belgi", sample: 'C001' },
    nomi: { required: YES, format: "Matn, ko'pi bilan 200 belgi", sample: 'Namuna mijoz' },
    kategoriya_kodi: { required: NO, format: "Mijoz kategoriyasi kodi (Ma'lumotnomalar → Mijoz kategoriyalari)", sample: 'K001', note: referenceNote('mijoz kategoriyasi', 'Mijoz kategoriyalari') },
  },
};

const FOOTNOTES = [
  "2-qatordagi namuna — faqat ko'rsatma. Uni o'chirib, o'z ma'lumotingizni yozing, aks holda namuna ham import qilinadi.",
  "1-qator (sarlavha) o'zgarmasligi kerak. Import faqat shu faylning birinchi varag'ini o'qiydi — «Yo'riqnoma» varag'i hisobga olinmaydi.",
];

/** Shablon .xlsx: 1-varaq — sarlavha + bitta namuna qator, 2-varaq — «Yo'riqnoma». `columns` — import turining ustunlari (KINDS). */
export function buildImportTemplate(path: ImportPath, columns: readonly ColumnSpec[]): Promise<Buffer> {
  const docs = DOCS[path];
  const header = columns.map((column) => column.name);
  const docOf = (name: string): ColumnDoc => {
    const doc = docs[name];
    if (!doc) throw new Error(`${path}: "${name}" ustuni uchun shablon ta'rifi yo'q — src/imports/import-templates.ts ni yangilang`);
    return doc;
  };

  const notes: Record<string, string> = {};
  const lists: Record<string, readonly string[]> = {};
  for (const name of header) {
    const { note, list } = docOf(name);
    if (note) notes[name] = note;
    if (list) lists[name] = list;
  }

  return buildWorkbook(
    header,
    [header.map((name) => docOf(name).sample)],
    {
      notes,
      lists,
      guide: {
        name: GUIDE_SHEET_NAME,
        header: GUIDE_HEADER,
        rows: header.map((name) => {
          const doc = docOf(name);
          return [name, doc.required, doc.format, doc.example ?? String(doc.sample)];
        }),
        footnotes: FOOTNOTES,
      },
    },
  );
}
