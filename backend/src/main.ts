import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { loadAuthConfig } from './config/auth.config';

async function bootstrap(): Promise<void> {
  // Sozlamalar xato bo'lsa (masalan, JWT_SECRET qisqa) — server umuman ishga tushmaydi.
  loadAuthConfig();

  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
  console.error('Server ishga tushmadi:', error instanceof Error ? error.message : error);
  process.exit(1);
});
