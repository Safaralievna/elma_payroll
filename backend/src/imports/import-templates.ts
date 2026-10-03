import { TEAM_LINK_TYPES } from '../team-links/team-link-types';
import { ColumnSpec } from './excel/sheet';
import { buildWorkbook } from './excel/workbook';
import { ImportPath } from './import-kind';

export const GUIDE_SHEET_NAME = "Yo'riqnoma";
export const GUIDE_HEADER = ['ustun', 'majburiymi', 'format', 'misol'] as const;

/** Shablon bitta ustuni: yo'riqnoma matni + misol (+ izoh va ro'yxat). */
interface ColumnDoc {
  required: string;
  format: string;
  /** Yo'riqnomadagi "misol" ustuni. Faqat hujjat uchun: 1-varaqda namuna qator YO'Q (soxta xodim import bo'lmasin). */
  example: string;
  /** Sarlavha katakchasiga Excel izohi. */
  note?: string;
  /** Ochiladigan ro'yxat qiymatlari. */
  list?: readonly string[];
}

const DATE = 'Sana: YYYY-MM-DD yoki DD.MM.YYYY';
const MONTH_START = "faqat oyning 1-kuni (masalan 2026-02-01)";
const NO = "Yo'q";
const YES = 'Ha';

const referenceNote = (what: string, where: string): string =>
  `Bu ${what} avval tizimda yaratilgan bo'lishi kerak (Ma'lumotnomalar → ${where})`;

/**
 * Hamma shablonlarning yagona manbai: GET /imports/templates/:type va `npm run templates:export`.
 * Seed'dagi kodlar haqiqiy (lavozim SALES_REP); seed'da yo'q kodlar (bo'lim, guruh, kategoriya)
 * izohda "avval yaratiladi" deb belgilangan. Misollar import'dan o'tishi test bilan tekshiriladi
 * (test/db/templates.db-spec.ts).
 */
const DOCS: Record<ImportPath, Record<string, ColumnDoc>> = {
  employees: {
    xodim_kodi: { required: YES, format: "Matn, ko'pi bilan 50 belgi. Xodim faqat shu kod bilan aniqlanadi", example: 'E001' },
    familiya: { required: NO, format: "Matn, ko'pi bilan 100 belgi", example: 'Aliyev' },
    ism: { required: NO, format: "Matn, ko'pi bilan 100 belgi", example: 'Vali' },
    otasining_ismi: { required: NO, format: "Matn, ko'pi bilan 100 belgi", example: 'Karimovich' },
    ishga_kirgan_sana: { required: NO, format: `${DATE}; istalgan kun`, example: '2026-01-15' },
    ishdan_ketgan_sana: { required: NO, format: `${DATE}; istalgan kun. Ishdan ketmagan bo'lsa — bo'sh qoldiring`, example: '2026-12-31' },
    bolim_kodi: {
      required: "Lavozim berilsa — ha",
      format: "Bo'lim kodi (Ma'lumotnomalar → Bo'limlar). bolim_kodi, lavozim_kodi va lavozim_sanasi birga to'ldiriladi",
      example: 'SAVDO',
      note: referenceNote("bo'lim", "Bo'limlar"),
    },
    lavozim_kodi: {
      required: 'Lavozim berilsa — ha',
      format: 'Lavozim kodi: SALES_REP, SUPERVISOR, OPERATOR yoki EXPEDITOR',
      example: 'SALES_REP',
    },
    lavozim_sanasi: { required: 'Lavozim berilsa — ha', format: `${DATE}; ${MONTH_START}`, example: '2026-02-01' },
    oylik: {
      required: 'Oylik berilsa — ha',
      format: "Son, so'mda; kasr ko'pi bilan 2 belgi. Minglik bo'shliq mumkin (3 000 000)",
      example: '3000000',
    },
    oylik_sanasi: { required: 'Oylik berilsa — ha', format: `${DATE}; ${MONTH_START}`, example: '2026-02-01' },
  },
  'team-links': {
    rahbar_kodi: { required: YES, format: 'Rahbarning xodim kodi (tizimda bor xodim)', example: 'E010' },
    xodim_kodi: { required: YES, format: "Bo'ysunuvchi xodimning kodi (tizimda bor xodim)", example: 'E001' },
    turi: { required: YES, format: "Ro'yxatdan tanlang: SUPERVISOR (supervayzer) yoki OPERATOR", example: 'SUPERVISOR', list: TEAM_LINK_TYPES },
    boshlanish_sanasi: { required: YES, format: `${DATE}; istalgan kun`, example: '2026-01-15' },
    tugash_sanasi: { required: NO, format: `${DATE}; hozir ham amal qilsa — bo'sh qoldiring`, example: '2026-12-31' },
  },
  products: {
    mahsulot_kodi: { required: YES, format: "Matn, ko'pi bilan 50 belgi", example: 'P001' },
    nomi: { required: YES, format: "Matn, ko'pi bilan 200 belgi", example: 'Namuna mahsulot' },
    guruh_kodi: { required: YES, format: "Mahsulot guruhi kodi (Ma'lumotnomalar → Mahsulot guruhlari)", example: 'G001', note: referenceNote('mahsulot guruhi', 'Mahsulot guruhlari') },
  },
  clients: {
    mijoz_kodi: { required: YES, format: "Matn, ko'pi bilan 50 belgi", example: 'C001' },
    nomi: { required: YES, format: "Matn, ko'pi bilan 200 belgi", example: 'Namuna mijoz' },
    kategoriya_kodi: { required: NO, format: "Mijoz kategoriyasi kodi (Ma'lumotnomalar → Mijoz kategoriyalari)", example: 'K001', note: referenceNote('mijoz kategoriyasi', 'Mijoz kategoriyalari') },
  },
  // Davr faylda emas — yuklashda tanlanadi (bitta fayl = bitta oy). KPI shu oyda xodimga biriktirilgan bo'lishi kerak.
  plans: {
    xodim_kodi: { required: YES, format: 'Xodim kodi (tizimda bor xodim)', example: 'E001' },
    kpi_kodi: {
      required: YES,
      format: "KPI kodi (KPI konstruktor). KPI shu oyda xodimga (lavozimi yoki ADD orqali) biriktirilgan bo'lishi kerak",
      example: 'SALES_VOLUME',
    },
    plan: {
      required: 'STEP, LINEAR va shartli FIXED — ha; boshqalarida bo\'sh',
      format: "Son, 0 dan katta; kasr ko'pi bilan 4 belgi. Minglik bo'shliq mumkin (150 000 000)",
      example: '150000000',
    },
    baza_summa: {
      required: "STEP va LINEAR — ha; boshqalarida bo'sh",
      format: "100% bajarilishdagi to'lov, so'mda; ≥ 0, kasr ko'pi bilan 2 belgi",
      example: '1500000',
    },
    qolda_summa: {
      required: "Faqat MANUAL turidagi KPI — ha; boshqalarida bo'sh",
      format: "Qo'lda kiritiladigan summa, so'mda; ≥ 0, kasr ko'pi bilan 2 belgi",
      example: '500000',
    },
  },
};

const FOOTNOTES = [
  "«misol» ustunidagi qiymatlar — faqat ko'rsatma. 1-varaqning 2-qatoridan boshlab o'z ma'lumotingizni yozing.",
  "1-qator (sarlavha) o'zgarmasligi kerak. Import faqat shu faylning birinchi varag'ini o'qiydi — «Yo'riqnoma» varag'i hisobga olinmaydi.",
];

/** Shablon .xlsx: 1-varaq — faqat sarlavha (namuna qator yo'q), 2-varaq — «Yo'riqnoma» (misollar shu yerda). `columns` — import turining ustunlari (KINDS). */
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
    [],
    {
      notes,
      lists,
      guide: {
        name: GUIDE_SHEET_NAME,
        header: GUIDE_HEADER,
        rows: header.map((name) => {
          const doc = docOf(name);
          return [name, doc.required, doc.format, doc.example];
        }),
        footnotes: FOOTNOTES,
      },
    },
  );
}
