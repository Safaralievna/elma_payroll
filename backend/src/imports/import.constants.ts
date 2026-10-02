/** Faylda ma'lumot qatorlari ko'pi bilan (team lead, 2026-10-02). Oshsa — 400 INVALID_FILE. */
export const IMPORT_MAX_ROWS = 50_000;

/** Yuklanadigan fayl hajmi chegarasi (texnik). Oshsa — 413 PAYLOAD_TOO_LARGE. */
export const IMPORT_MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Katta import (50 000 qator) bitta tranzaksiyada — standart 5 soniya yetmaydi. */
export const IMPORT_TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;

/** INVALID javobida ko'rsatiladigan xatolar soni; to'liq ro'yxat — GET /imports/:id/errors. */
export const IMPORT_ERRORS_IN_RESPONSE = 100;
