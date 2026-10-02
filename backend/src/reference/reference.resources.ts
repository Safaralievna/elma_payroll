import { z } from 'zod';
import { codeSchema, idSchema } from '../common/schemas';
import { Prisma } from '../generated/prisma/client';

/**
 * Ma'lumotnomalar: 8 ta jadval bir xil shaklda (kod, nom, isActive) va bir xil
 * qoidalar bilan ishlaydi. Har biri uchun alohida modul yozish o'rniga — shu
 * konfiguratsiya va bitta umumiy servis/kontroller (reference.service.ts).
 */

type Db = Prisma.TransactionClient;

export interface ReferenceRow {
  id: bigint;
  code: string | null;
  name: string;
  isActive: boolean;
  [field: string]: unknown;
}

/**
 * Prisma delegatining (db.department, db.product ...) shu modulga kerakli qismi.
 * Har bir jadvalning delegati shu shaklga mos — lekin Prisma'ning generik turlari
 * umumiy interfeysga o'z-o'zidan sig'maydi, shuning uchun `delegate()` da tur keltiriladi.
 */
export interface ReferenceDelegate {
  count(args: { where: object }): Promise<number>;
  findMany(args: { where: object; orderBy: object; skip: number; take: number; include?: object }): Promise<ReferenceRow[]>;
  findUnique(args: { where: { id: bigint } | { code: string }; include?: object }): Promise<ReferenceRow | null>;
  create(args: { data: object; include?: object }): Promise<ReferenceRow>;
  update(args: { where: { id: bigint }; data: object; include?: object }): Promise<ReferenceRow>;
}

export interface ParentLink {
  /** FK ustuni (Prisma nomi). */
  field: 'productGroupId' | 'clientCategoryId';
  /** Prisma relation nomi — view'da ota yozuv kodi uchun. */
  relation: 'productGroup' | 'clientCategory';
  label: string;
  delegate(db: Db): ReferenceDelegate;
}

export interface ReferenceResource {
  /** URL: /api/<path> */
  path: string;
  /** audit_logs.entity_type */
  table: string;
  /** Xabarlar uchun nom. */
  label: string;
  delegate(db: Db): ReferenceDelegate;
  createSchema: z.ZodType<Record<string, unknown>>;
  updateSchema: z.ZodType<Record<string, unknown>>;
  parent?: ParentLink;
  /** Ota yozuv bo'yicha ro'yxat filtri (productGroupId=..., clientCategoryId=...). */
  filterShape?: z.ZodRawShape;
  hasTimestamps: boolean;
  /** Asosiy maydonlardan tashqari view maydonlari. */
  extraView?(row: ReferenceRow): Record<string, unknown>;
}

const asDelegate = (delegate: unknown) => delegate as ReferenceDelegate;

function schemas(nameMax: number, extra: z.ZodRawShape = {}) {
  const shape = { name: z.string().trim().min(1).max(nameMax), code: codeSchema, isActive: z.boolean().optional(), ...extra };
  return {
    createSchema: z.strictObject(shape),
    updateSchema: z
      .strictObject(shape)
      .partial()
      .refine((value) => Object.values(value).some((field) => field !== undefined), {
        message: "Kamida bitta maydon o'zgartirilishi kerak",
      }),
  };
}

/** Depozit foizi: "10" yoki "10.5", 0–100, ko'pi bilan 2 kasr. null — lavozimda depozit yo'q. */
const depositPercentSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Foiz satr ko'rinishida, ko'pi bilan 2 kasr belgisi bilan bo'lishi kerak")
  .refine((value) => Number(value) <= 100, "Foiz 0 dan 100 gacha bo'lishi kerak")
  .nullable();

const productGroupParent: ParentLink = {
  field: 'productGroupId',
  relation: 'productGroup',
  label: 'Mahsulot guruhi',
  delegate: (db) => asDelegate(db.productGroup),
};

const clientCategoryParent: ParentLink = {
  field: 'clientCategoryId',
  relation: 'clientCategory',
  label: 'Mijoz kategoriyasi',
  delegate: (db) => asDelegate(db.clientCategory),
};

const parentView = (link: ParentLink) => (row: ReferenceRow) => {
  const parent = row[link.relation] as { code: string | null } | null;
  const prefix = link.relation;
  return {
    [link.field]: (row[link.field] as bigint | null)?.toString() ?? null,
    [`${prefix}Code`]: parent?.code ?? null,
  };
};

export const REFERENCE_RESOURCES: ReferenceResource[] = [
  {
    path: 'departments',
    table: 'departments',
    label: "Bo'lim",
    delegate: (db) => asDelegate(db.department),
    ...schemas(150),
    hasTimestamps: true,
  },
  {
    path: 'positions',
    table: 'positions',
    label: 'Lavozim',
    delegate: (db) => asDelegate(db.position),
    ...schemas(150, { depositPercent: depositPercentSchema.optional() }),
    hasTimestamps: true,
    extraView: (row) => ({ depositPercent: (row.depositPercent as Prisma.Decimal | null)?.toFixed(2) ?? null }),
  },
  {
    path: 'product-groups',
    table: 'product_groups',
    label: 'Mahsulot guruhi',
    delegate: (db) => asDelegate(db.productGroup),
    ...schemas(150),
    hasTimestamps: true,
  },
  {
    path: 'products',
    table: 'products',
    label: 'Mahsulot',
    delegate: (db) => asDelegate(db.product),
    ...schemas(200, { productGroupId: idSchema }),
    parent: productGroupParent,
    filterShape: { productGroupId: idSchema.optional() },
    hasTimestamps: true,
    extraView: parentView(productGroupParent),
  },
  {
    path: 'client-categories',
    table: 'client_categories',
    label: 'Mijoz kategoriyasi',
    delegate: (db) => asDelegate(db.clientCategory),
    ...schemas(150),
    hasTimestamps: true,
  },
  {
    path: 'clients',
    table: 'clients',
    label: 'Mijoz',
    delegate: (db) => asDelegate(db.client),
    ...schemas(200, { clientCategoryId: idSchema.nullable().optional() }),
    parent: clientCategoryParent,
    filterShape: { clientCategoryId: idSchema.optional() },
    hasTimestamps: true,
    extraView: parentView(clientCategoryParent),
  },
  {
    path: 'price-types',
    table: 'price_types',
    label: 'Narx turi',
    delegate: (db) => asDelegate(db.priceType),
    ...schemas(100),
    hasTimestamps: false,
  },
  {
    // KPI o'lchov birliklari (UZS, DONA, AKB ...) — DECISIONS 2.5.
    path: 'kpi-units',
    table: 'kpi_units',
    label: "O'lchov birligi",
    delegate: (db) => asDelegate(db.kpiUnit),
    ...schemas(100, { code: codeSchema.max(30), description: z.string().trim().max(255).nullable().optional() }),
    hasTimestamps: false,
    extraView: (row) => ({ description: row.description ?? null }),
  },
];
