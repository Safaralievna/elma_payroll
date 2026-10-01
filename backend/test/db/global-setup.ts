import 'dotenv/config';
import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { testDatabaseUrl } from './db-helpers';

/**
 * Test bazasini har safar noldan yaratadi va migratsiyalarni qo'llaydi.
 * Asosiy bazaga (DATABASE_URL) tegmaydi.
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(testDatabaseUrl());
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
