import { Prisma } from '../generated/prisma/client';

/** Foydalanuvchini javob uchun yuklashda doim shu bog'lanishlar olinadi. */
export const USER_INCLUDE = {
  roles: { include: { role: true } },
  employee: { select: { employeeCode: true } },
} satisfies Prisma.UserInclude;

export type UserWithRelations = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

/** API javobidagi foydalanuvchi. Parol xeshi bu yerga hech qachon kirmaydi. */
export interface UserView {
  id: string;
  username: string;
  isActive: boolean;
  /** Bog'langan xodimning biznes kodi (employees.employee_id). */
  employeeCode: string | null;
  roles: string[];
  createdAt: string;
  updatedAt: string;
}

export function toUserView(user: UserWithRelations): UserView {
  return {
    id: user.id.toString(),
    username: user.username,
    isActive: user.isActive,
    employeeCode: user.employee?.employeeCode ?? null,
    roles: user.roles.map((userRole) => userRole.role.name).sort(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

/** Audit uchun: o'zgarishi mumkin bo'lgan maydonlar (id va vaqtlarsiz). */
export function toUserAuditSnapshot(view: UserView) {
  return { username: view.username, isActive: view.isActive, employeeCode: view.employeeCode, roles: view.roles };
}
