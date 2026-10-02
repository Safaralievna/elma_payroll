import { HttpStatus, Injectable } from '@nestjs/common';
import { hash } from 'argon2';
import { AuditService } from '../audit/audit.service';
import { RoleName } from '../auth/auth.constants';
import { AuthUser } from '../auth/auth.types';
import { AppError } from '../common/app-error';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toUserAuditSnapshot, toUserView, USER_INCLUDE, UserView } from './user-view';
import { CreateUserInput, ResetPasswordInput, UpdateUserInput } from './users.schemas';

const ENTITY_TYPE = 'users';

/**
 * Foydalanuvchilarni boshqarish (faqat ADMIN). Foydalanuvchi o'chirilmaydi —
 * bloklanadi (isActive = false): audit yozuvlari unga bog'langan.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserView[]> {
    const users = await this.prisma.user.findMany({ include: USER_INCLUDE, orderBy: { id: 'asc' } });
    return users.map(toUserView);
  }

  async getById(id: bigint): Promise<UserView> {
    const user = await this.prisma.user.findUnique({ where: { id }, include: USER_INCLUDE });
    if (!user) throw userNotFound(id);
    return toUserView(user);
  }

  async create(actor: AuthUser, input: CreateUserInput): Promise<UserView> {
    // Xesh tranzaksiyadan oldin — tranzaksiya qisqa bo'lishi uchun.
    const passwordHash = await hash(input.password);

    return this.prisma.$transaction(async (tx) => {
      if (await tx.user.findUnique({ where: { username: input.username } })) {
        throw new AppError(HttpStatus.CONFLICT, 'USERNAME_TAKEN', `"${input.username}" logini band`);
      }
      const roleIds = await resolveRoleIds(tx, input.roles);
      const employeeId = input.employeeCode ? await resolveEmployeeId(tx, input.employeeCode, null) : null;

      const created = await tx.user.create({
        data: {
          username: input.username,
          passwordHash,
          employeeId,
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
        },
        include: USER_INCLUDE,
      });
      const view = toUserView(created);

      await this.audit.log(tx, {
        userId: actor.id,
        action: 'USER_CREATE',
        entityType: ENTITY_TYPE,
        entityId: created.id,
        newData: toUserAuditSnapshot(view),
      });
      return view;
    });
  }

  async update(actor: AuthUser, id: bigint, input: UpdateUserInput): Promise<UserView> {
    return this.prisma.$transaction(async (tx) => {
      // Faol adminlar qulflanadi: ikki admin bir vaqtda bir-birini ADMIN'likdan
      // olsa ham, LAST_ADMIN tekshiruvi ketma-ket bajariladi.
      await lockActiveAdmins(tx);

      const before = await tx.user.findUnique({ where: { id }, include: USER_INCLUDE });
      if (!before) throw userNotFound(id);
      const beforeView = toUserView(before);

      const nextRoles = input.roles ?? beforeView.roles;
      const nextActive = input.isActive ?? beforeView.isActive;
      const wasActiveAdmin = beforeView.isActive && beforeView.roles.includes('ADMIN');
      const staysActiveAdmin = nextActive && nextRoles.includes('ADMIN');
      if (wasActiveAdmin && !staysActiveAdmin) {
        const otherAdmins = await tx.user.count({
          where: { id: { not: id }, isActive: true, roles: { some: { role: { name: 'ADMIN' } } } },
        });
        if (otherAdmins === 0) {
          throw new AppError(
            HttpStatus.CONFLICT,
            'LAST_ADMIN',
            "Bu oxirgi faol admin: uni bloklab yoki ADMIN rolini olib bo'lmaydi",
          );
        }
      }

      const data: Prisma.UserUncheckedUpdateInput = {};
      if (input.isActive !== undefined) data.isActive = input.isActive;
      if (input.employeeCode !== undefined) {
        data.employeeId = input.employeeCode === null ? null : await resolveEmployeeId(tx, input.employeeCode, id);
      }
      if (input.roles) {
        const roleIds = await resolveRoleIds(tx, input.roles);
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }

      const after = await tx.user.update({ where: { id }, data, include: USER_INCLUDE });
      const afterView = toUserView(after);

      await this.audit.log(tx, {
        userId: actor.id,
        action: 'USER_UPDATE',
        entityType: ENTITY_TYPE,
        entityId: id,
        oldData: toUserAuditSnapshot(beforeView),
        newData: toUserAuditSnapshot(afterView),
      });
      return afterView;
    });
  }

  async resetPassword(actor: AuthUser, id: bigint, input: ResetPasswordInput): Promise<void> {
    const passwordHash = await hash(input.newPassword);

    await this.prisma.$transaction(async (tx) => {
      if (!(await tx.user.findUnique({ where: { id } }))) throw userNotFound(id);
      await tx.user.update({ where: { id }, data: { passwordHash } });
      await this.audit.log(tx, {
        userId: actor.id,
        action: 'USER_PASSWORD_RESET',
        entityType: ENTITY_TYPE,
        entityId: id,
      });
    });
  }

  async listRoles(): Promise<{ id: string; name: string; description: string | null }[]> {
    const roles = await this.prisma.role.findMany({ orderBy: { id: 'asc' } });
    return roles.map((role) => ({ id: role.id.toString(), name: role.name, description: role.description }));
  }
}

function userNotFound(id: bigint): AppError {
  return new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `Foydalanuvchi topilmadi (id=${id})`);
}

async function lockActiveAdmins(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$queryRaw`
    SELECT u.id FROM users u
    WHERE u.is_active AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = u.id AND r.name = 'ADMIN'
    )
    FOR UPDATE OF u`;
}

async function resolveRoleIds(tx: Prisma.TransactionClient, names: RoleName[]): Promise<bigint[]> {
  const roles = await tx.role.findMany({ where: { name: { in: names } } });
  const missing = names.filter((name) => !roles.some((role) => role.name === name));
  if (missing.length > 0) {
    // Rollar seed orqali yaratiladi — bu foydalanuvchi xatosi emas, sozlash xatosi.
    throw new AppError(
      HttpStatus.INTERNAL_SERVER_ERROR,
      'INVALID_CONFIGURATION',
      `Rol bazada topilmadi: ${missing.join(', ')} (seed ishga tushirilganmi?)`,
    );
  }
  return roles.map((role) => role.id);
}

/** employeeCode (biznes kodi) → employees.id. Xodim boshqa foydalanuvchiga bog'langan bo'lsa — xato. */
async function resolveEmployeeId(
  tx: Prisma.TransactionClient,
  employeeCode: string,
  currentUserId: bigint | null,
): Promise<bigint> {
  const employee = await tx.employee.findUnique({ where: { employeeCode }, include: { user: true } });
  if (!employee) {
    throw new AppError(HttpStatus.NOT_FOUND, 'EMPLOYEE_NOT_FOUND', `Xodim topilmadi: ${employeeCode}`);
  }
  if (employee.user && employee.user.id !== currentUserId) {
    throw new AppError(
      HttpStatus.CONFLICT,
      'EMPLOYEE_ALREADY_LINKED',
      `Xodim ${employeeCode} boshqa foydalanuvchiga bog'langan`,
    );
  }
  return employee.id;
}
