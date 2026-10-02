/**
 * Fayl darajasidagi xato (Excel emas, sarlavha noto'g'ri, qatorlar juda ko'p ...).
 * Bunda batch yaratilmaydi — servis uni 400 INVALID_FILE ga aylantiradi.
 * Qator xatolari esa boshqacha: ular to'planadi va batch INVALID bo'ladi.
 */
export class ImportFileError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ImportFileError';
  }
}

/** Bitta qatordagi xato: qaysi ustun va nima noto'g'ri. */
export interface RowError {
  field: string | null;
  message: string;
}
