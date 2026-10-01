/**
 * Import versiyalarini faollashtirish qoidasi (test_cases.json, 8-bo'lim).
 *
 * - Versiya raqami (period, import_type) ichida ketma-ket o'sadi.
 * - Yangi yaroqli yuklash shu (period, import_type) dagi eski ACTIVE ni ARCHIVED qiladi.
 * - Boshqa turdagi importlarga tegmaydi (SALES v2 yuklansa, PLANS v1 ACTIVE qoladi).
 * - Hech narsa o'chirilmaydi.
 *
 * Bu toza funksiya — servis qatlami natijani bitta tranzaksiyada DB ga yozadi,
 * DB esa "bitta (period, import_type) da faqat bitta ACTIVE" partial unique index bilan himoyalaydi.
 */
export type ImportBatchStatus = 'ACTIVE' | 'ARCHIVED';

export interface ExistingImportBatch {
  id: string;
  periodId: string;
  importType: string;
  versionNumber: number;
  status: ImportBatchStatus;
}

export interface ImportActivationPlan {
  newVersionNumber: number;
  batchIdsToArchive: string[];
}

export function planImportActivation(
  existing: readonly ExistingImportBatch[],
  periodId: string,
  importType: string,
): ImportActivationPlan {
  const sameKind = existing.filter((b) => b.periodId === periodId && b.importType === importType);
  const maxVersion = sameKind.reduce((max, b) => Math.max(max, b.versionNumber), 0);
  return {
    newVersionNumber: maxVersion + 1,
    batchIdsToArchive: sameKind.filter((b) => b.status === 'ACTIVE').map((b) => b.id),
  };
}
