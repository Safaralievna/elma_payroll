import { createHash } from 'node:crypto';

/**
 * Parol xeshining qisqa barmoq izi — tokenga yoziladi (`pwd`).
 *
 * Parol almashtirilsa yoki tiklansa, xesh (argon2 har safar yangi salt bilan)
 * o'zgaradi, demak iz ham o'zgaradi va eski tokenlar darhol yaroqsiz bo'ladi.
 * Xeshning o'zi tokenga chiqmaydi — faqat sha256 dan olingan 16 belgi.
 */
export function passwordFingerprint(passwordHash: string): string {
  return createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);
}
