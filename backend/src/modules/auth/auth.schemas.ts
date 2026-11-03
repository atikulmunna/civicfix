/** Request schemas for the auth routes (SRS v1.1 §9.2). */
import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(120),
  email: z.string().trim().max(255).pipe(z.email('A valid email is required.')),
  password: z.string().min(1, 'Password is required.'),
  phone: z.string().trim().max(30).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().pipe(z.email('A valid email is required.')),
  password: z.string().min(1, 'Password is required.'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  // Length cap guards the password hasher; the policy itself is enforced by
  // assertPasswordPolicy in the service.
  newPassword: z.string().min(1, 'New password is required.').max(200),
});
