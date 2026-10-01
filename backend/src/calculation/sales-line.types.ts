/**
 * Hisoblash yadrosi ko'radigan savdo qatori.
 *
 * ERD sales_lines + bog'langan ma'lumotnomalardan yig'iladi:
 *   product_group_id  — products.product_group_id orqali
 *   client_category_id — clients.client_category_id orqali
 * Bu "tekis" ko'rinish filtrlarni oddiy qiladi: filtr faqat maydon nomi bilan ishlaydi.
 */
export interface SalesLineForCalculation {
  employeeId: string;
  productId?: string | null;
  productGroupId?: string | null;
  clientId?: string | null;
  clientCategoryId?: string | null;
  priceTypeId?: string | null;
  /** Qaytarish qatorlarida manfiy bo'ladi. */
  quantity?: string | number | null;
  /** Qaytarish qatorlarida manfiy bo'ladi. */
  amount?: string | number | null;
  /** sales_lines.sale_date ("YYYY-MM-DD") — TEAM scope'da jamoani aniqlash uchun. */
  saleDate?: string | null;
  /** sales_lines.original_sale_date — faqat qaytarish qatorlarida. */
  originalSaleDate?: string | null;
}

/**
 * ERD kpi_rule_filters.field_name va kpi_definitions.source_field qiymatlari
 * → SalesLineForCalculation maydoni.
 * Faqat shu ro'yxatdagi maydonlarga ruxsat bor (ixtiyoriy maydon nomi bilan
 * obyektni o'qish xavfsizlik va xato manbai bo'lardi).
 */
export const SALES_LINE_FIELDS = {
  employee_id: 'employeeId',
  product_id: 'productId',
  product_group_id: 'productGroupId',
  client_id: 'clientId',
  client_category_id: 'clientCategoryId',
  price_type_id: 'priceTypeId',
  quantity: 'quantity',
  amount: 'amount',
} as const satisfies Record<string, keyof SalesLineForCalculation>;

export type SalesLineField = keyof typeof SALES_LINE_FIELDS;

export function isSalesLineField(value: string): value is SalesLineField {
  return Object.prototype.hasOwnProperty.call(SALES_LINE_FIELDS, value);
}

export function readSalesLineField(
  line: SalesLineForCalculation,
  field: SalesLineField,
): string | number | null | undefined {
  return line[SALES_LINE_FIELDS[field]];
}
