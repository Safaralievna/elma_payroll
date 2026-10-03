import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../generated/prisma/client';
import { serializeQueries } from './serialize-queries';

/**
 * Bazaga yagona ulanish. Servislar shu klientni to'g'ridan-to'g'ri ishlatadi
 * (Prisma ustidan qo'shimcha repository qatlami yo'q — CLAUDE.md 10-qoida).
 * Prisma 7: ulanish driver adapter (pg) orqali.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL o\'rnatilmagan (backend/.env ga qarang)');
    }
    // Har bir ulanishda so'rovlar ketma-ket (serialize-queries.ts: Prisma include'lari parallel so'rov yuboradi).
    const pool = new Pool({ connectionString });
    pool.on('connect', serializeQueries);
    super({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
