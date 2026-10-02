import { INestApplication } from '@nestjs/common';

/** main.ts va E2E testlar uchun umumiy sozlamalar — test ham haqiqiy server kabi ishlaydi. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
}
