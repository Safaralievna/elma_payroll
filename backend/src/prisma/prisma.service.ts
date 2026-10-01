import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

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
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
