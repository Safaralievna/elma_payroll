import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppError } from '../common/app-error';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './auth.constants';
import { AuthenticatedRequest, JwtPayload } from './auth.types';

/**
 * Global guard: `@Public()` belgilanmagan hamma endpoint token talab qiladi.
 *
 * Token faqat "kim" ekanini aytadi. Foydalanuvchi va rollar har so'rovda bazadan
 * o'qiladi — admin kimnidir bloklasa yoki rolini olsa, darhol kuchga kiradi.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw unauthorized('Token berilmagan');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token);
    } catch {
      throw unauthorized("Token yaroqsiz yoki muddati o'tgan");
    }
    if (typeof payload.sub !== 'string' || !/^\d{1,18}$/.test(payload.sub)) {
      throw unauthorized('Token yaroqsiz');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: BigInt(payload.sub) },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw unauthorized('Foydalanuvchi topilmadi');
    }
    if (!user.isActive) {
      throw new AppError(HttpStatus.UNAUTHORIZED, 'USER_INACTIVE', 'Foydalanuvchi bloklangan');
    }

    request.user = {
      id: user.id,
      username: user.username,
      roles: user.roles.map((userRole) => userRole.role.name),
    };
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

function unauthorized(message: string): AppError {
  return new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
}
