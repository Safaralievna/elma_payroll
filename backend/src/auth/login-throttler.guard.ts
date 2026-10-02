import { HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AppError } from '../common/app-error';

/**
 * Faqat /auth/login ga qo'yiladi: IP bo'yicha urinishlar soni cheklanadi
 * (LOGIN_THROTTLE). Oshsa — 429 TOO_MANY_ATTEMPTS, umumiy xato formatida.
 */
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(): Promise<void> {
    throw new AppError(
      HttpStatus.TOO_MANY_REQUESTS,
      'TOO_MANY_ATTEMPTS',
      "Kirish urinishlari juda ko'p. Bir daqiqadan keyin qayta urinib ko'ring",
    );
  }
}
