import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth.constants';

/** Yangi parol talabi (yaratish, almashtirish, tiklash). */
export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Parol kamida ${PASSWORD_MIN_LENGTH} belgi bo'lishi kerak`)
  .max(PASSWORD_MAX_LENGTH, `Parol ko'pi bilan ${PASSWORD_MAX_LENGTH} belgi bo'lishi kerak`);

/** Mavjud parolni tekshirish: uzunlik talabi yo'q, faqat yuqori chegara (argon2 ni himoya qiladi). */
const existingPasswordSchema = z
  .string()
  .min(1, 'Parol kiritilmagan')
  .max(PASSWORD_MAX_LENGTH, `Parol ko'pi bilan ${PASSWORD_MAX_LENGTH} belgi bo'lishi kerak`);

export const usernameSchema = z.string().trim().min(1, 'Login kiritilmagan').max(100);

export const loginSchema = z.strictObject({
  username: usernameSchema,
  password: existingPasswordSchema,
});
export type LoginInput = z.output<typeof loginSchema>;

export const changePasswordSchema = z.strictObject({
  currentPassword: existingPasswordSchema,
  newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.output<typeof changePasswordSchema>;
