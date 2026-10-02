import { Decimal } from '../../calculation/decimal';
import { dateToIso, isIsoDate } from '../../common/iso-date';
import { isBlank } from './sheet';
import { SheetCell } from './workbook';

interface FieldOptions {
  required: boolean;
}

/** Decimal(18,2): butun qismi ko'pi bilan 16 xona. */
const MONEY_MAX = new Decimal('1e16');

/**
 * Bitta qatorning katakchalarini turga o'giradi. Xato bo'lsa — `null` qaytaradi va
 * xatoni `errors` ga yozadi (birinchi xatoda to'xtamaydi: foydalanuvchi qatordagi
 * hamma xatoni birdaniga ko'radi). Bo'sh katakcha — `null` (majburiy bo'lsa, xato).
 */
export class RowReader {
  readonly errors: { field: string; message: string }[] = [];

  constructor(private readonly values: Record<string, SheetCell>) {}

  addError(field: string, message: string): void {
    this.errors.push({ field, message });
  }

  /** Katakcha bo'sh emasmi (ixtiyoriy ustunlarni "birga berilishi kerak" tekshiruvi uchun). */
  has(field: string): boolean {
    return !isBlank(this.values[field]);
  }

  text(field: string, options: FieldOptions & { max: number }): string | null {
    const cell = this.cell(field, options);
    if (cell === null) return null;
    if (typeof cell === 'number' && Number.isFinite(cell)) return this.checkLength(field, String(cell), options.max);
    if (typeof cell !== 'string') return this.fail(field, "Matn bo'lishi kerak");
    return this.checkLength(field, cell.trim(), options.max);
  }

  /** "YYYY-MM-DD" qaytaradi. Qabul qilinadi: Excel sana katakchasi, YYYY-MM-DD, DD.MM.YYYY. */
  date(field: string, options: FieldOptions): string | null {
    const cell = this.cell(field, options);
    if (cell === null) return null;
    if (cell instanceof Date) {
      if (Number.isNaN(cell.getTime())) return this.fail(field, "Sana noto'g'ri");
      return dateToIso(cell);
    }
    if (typeof cell === 'string') {
      const text = cell.trim();
      const dotted = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);
      const iso = dotted ? `${dotted[3]}-${dotted[2]}-${dotted[1]}` : text;
      if (isIsoDate(iso)) return iso;
    }
    return this.fail(field, "Sana noto'g'ri — Excel sanasi, YYYY-MM-DD yoki DD.MM.YYYY bo'lishi kerak");
  }

  /** Pul summasi: ≥ 0, ko'pi bilan 2 kasr belgisi. Matnda bo'shliqlar (minglik ajratgich) va vergul ruxsat. */
  money(field: string, options: FieldOptions): Decimal | null {
    const cell = this.cell(field, options);
    if (cell === null) return null;
    let text: string;
    if (typeof cell === 'number' && Number.isFinite(cell)) text = String(cell);
    else if (typeof cell === 'string') text = cell.replace(/[\s  ]/g, '').replace(',', '.');
    else return this.fail(field, "Son bo'lishi kerak");

    if (!/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(text)) return this.fail(field, "Son bo'lishi kerak");
    const value = new Decimal(text);
    if (value.isNegative()) return this.fail(field, "Manfiy bo'lmasligi kerak");
    if (value.decimalPlaces() > 2) return this.fail(field, "Ko'pi bilan 2 kasr belgisi bo'lishi mumkin");
    if (value.greaterThanOrEqualTo(MONEY_MAX)) return this.fail(field, 'Summa juda katta');
    return value;
  }

  /** Ruxsat etilgan qiymatlardan biri (katta-kichik harfga sezgir emas). */
  oneOf<T extends string>(field: string, allowed: readonly T[], options: FieldOptions): T | null {
    const text = this.text(field, { ...options, max: 100 });
    if (text === null) return null;
    const found = allowed.find((value) => value === text.toUpperCase());
    return found ?? this.fail(field, `Ruxsat etilgan qiymatlar: ${allowed.join(', ')}`);
  }

  private cell(field: string, options: FieldOptions): SheetCell {
    const cell = this.values[field];
    if (isBlank(cell)) {
      if (options.required) this.addError(field, "To'ldirilishi majburiy");
      return null;
    }
    return cell as SheetCell;
  }

  private checkLength(field: string, text: string, max: number): string | null {
    return text.length > max ? this.fail(field, `Ko'pi bilan ${max} belgi bo'lishi mumkin`) : text;
  }

  private fail(field: string, message: string): null {
    this.addError(field, message);
    return null;
  }
}
