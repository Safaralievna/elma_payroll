import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { e2eDatabaseUrl, testDatabaseUrl } from './db-helpers';

/**
 * Test bazalarini har safar noldan yaratadi va migratsiyalarni qo'llaydi:
 * rollback testlari uchun TEST_DATABASE_URL va E2E testlari uchun uning `_e2e` nusxasi.
 * Asosiy bazaga (DATABASE_URL) tegmaydi.
 */
export default async function globalSetup(): Promise<void> {
  for (const testUrl of [testDatabaseUrl(), e2eDatabaseUrl()]) {
    await recreateDatabase(new URL(testUrl));
  }
}

async function recreateDatabase(url: URL): Promise<void> {
  const dbName = url.pathname.slice(1);

  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  });
}
