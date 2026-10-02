import { HttpStatus, Injectable, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { toUserView, USER_INCLUDE, UserView } from '../users/user-view';
import { ChangePasswordInput, LoginInput } from './auth.schemas';
import { AuthUser, JwtPayload } from './auth.types';
import { passwordFingerprint } from './password-fingerprint';

export interface LoginResult {
  accessToken: string;
  user: UserView;
}

type LoginFailReason = 'UNKNOWN_USER' | 'WRONG_PASSWORD' | 'USER_INACTIVE';

@Injectable()
export class AuthService implements OnModuleInit {
  /**
   * Foydalanuvchi topilmaganda ham argon2.verify chaqiriladi — shunda javob vaqti
   * bo'yicha login mavjudligini bilib bo'lmaydi. Xesh ishga tushishda haqiqiy
   * xeshlar bilan bir xil parametrlarda (shu `hash` funksiyasi) yaratiladi.
   */
  private dummyHash: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(randomBytes(32).toString('hex'));
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username }, include: USER_INCLUDE });

    if (!user) {
      if (!this.dummyHash) {
        throw new Error('AuthService: soxta xesh tayyor emas (onModuleInit chaqirilmagan)');
      }
      await verify(this.dummyHash, input.password);
      await this.logFailure(input.username, null, 'UNKNOWN_USER');
      throw invalidCredentials();
    }

    // Avval parol: parolni bilmagan odamga foydalanuvchi bloklanganligi ham aytilmaydi.
    if (!(await verify(user.passwordHash, input.password))) {
      await this.logFailure(input.username, user.id, 'WRONG_PASSWORD');
      throw invalidCredentials();
    }
    if (!user.isActive) {
      await this.logFailure(input.username, user.id, 'USER_INACTIVE');
      throw new AppError(HttpStatus.UNAUTHORIZED, 'USER_INACTIVE', 'Foydalanuvchi bloklangan');
    }

    const payload: JwtPayload = { sub: user.id.toString(), pwd: passwordFingerprint(user.passwordHash) };
    const accessToken = await this.jwt.signAsync(payload);
    await this.audit.log(this.prisma, {
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'users',
      entityId: user.id,
    });
    return { accessToken, user: toUserView(user) };
  }

  async changePassword(actor: AuthUser, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: actor.id } });
    if (!user) {
      throw new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Foydalanuvchi topilmadi');
    }
    if (!(await verify(user.passwordHash, input.currentPassword))) {
      throw new AppError(HttpStatus.BAD_REQUEST, 'INVALID_CURRENT_PASSWORD', "Joriy parol noto'g'ri");
    }

    const passwordHash = await hash(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: actor.id }, data: { passwordHash } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'PASSWORD_CHANGE',
        entityType: 'users',
        entityId: actor.id,
      });
    });
  }

  /** Muvaffaqiyatsiz urinish: kim ekanligi noma'lum (userId = null), parol yozilmaydi. */
  private logFailure(username: string, entityId: bigint | null, reason: LoginFailReason): Promise<void> {
    return this.audit.log(this.prisma, {
      userId: null,
      action: 'LOGIN_FAILED',
      entityType: 'users',
      entityId,
      newData: { username, reason },
    });
  }
}

function invalidCredentials(): AppError {
  return new AppError(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', "Login yoki parol noto'g'ri");
}
