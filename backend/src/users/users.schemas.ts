import { z } from 'zod';
import { ROLE_NAMES } from '../auth/auth.constants';
import { newPasswordSchema, usernameSchema } from '../auth/auth.schemas';

const rolesSchema = z
  .array(z.enum(ROLE_NAMES))
  .min(1, 'Kamida bitta rol kerak')
  .transform((roles) => [...new Set(roles)]);

/** Xodim faqat biznes kodi (employees.employee_id) orqali ko'rsatiladi. null — bog'lanishni olib tashlash. */
const employeeCodeSchema = z.string().trim().min(1).max(50).nullable();

export const createUserSchema = z.strictObject({
  username: usernameSchema,
  password: newPasswordSchema,
  roles: rolesSchema,
  employeeCode: employeeCodeSchema.optional(),
});
export type CreateUserInput = z.output<typeof createUserSchema>;

export const updateUserSchema = z
  .strictObject({
    roles: rolesSchema.optional(),
    isActive: z.boolean().optional(),
    employeeCode: employeeCodeSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Kamida bitta maydon o'zgartirilishi kerak",
  });
export type UpdateUserInput = z.output<typeof updateUserSchema>;

export const resetPasswordSchema = z.strictObject({
  newPassword: newPasswordSchema,
});
export type ResetPasswordInput = z.output<typeof resetPasswordSchema>;
