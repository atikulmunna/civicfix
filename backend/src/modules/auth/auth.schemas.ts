/** Request schemas for the auth routes (SRS v1.1 §9.2). */
import { z } from 'zod';
import { zodMessage } from '../../lib/messages.js';

export const registerSchema = z.object({
  name: z.string().trim().min(1, zodMessage('field.nameRequired')).max(120),
  email: z
    .string()
    .trim()
    .max(255)
    .pipe(z.email(zodMessage('field.email'))),
  password: z.string().min(1, zodMessage('field.passwordRequired')),
  phone: z.string().trim().max(30).optional(),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email(zodMessage('field.email'))),
  password: z.string().min(1, zodMessage('field.passwordRequired')),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, zodMessage('field.currentPasswordRequired')),
  // Length cap guards the password hasher; the policy itself is enforced by
  // assertPasswordPolicy in the service.
  newPassword: z.string().min(1, zodMessage('field.newPasswordRequired')).max(200),
});
