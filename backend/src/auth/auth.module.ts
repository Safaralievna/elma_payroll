import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { loadAuthConfig } from '../config/auth.config';
import { UsersModule } from '../users/users.module';
import { LOGIN_THROTTLE } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      // loadAuthConfig xato bersa (JWT_SECRET yo'q yoki qisqa) — ilova ishga tushmaydi.
      useFactory: () => {
        const config = loadAuthConfig();
        return {
          secret: config.jwtSecret,
          signOptions: { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    // Cheklov faqat LoginThrottlerGuard qo'yilgan joyda ishlaydi (hozir — faqat login).
    ThrottlerModule.forRoot([{ name: LOGIN_THROTTLE.name, ttl: LOGIN_THROTTLE.ttlMs, limit: LOGIN_THROTTLE.limit }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // Tartib muhim: avval token (JwtAuthGuard), keyin rol (RolesGuard).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
