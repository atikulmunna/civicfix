/**
 * Validated environment configuration. Fails fast at startup if a required
 * variable is missing or malformed, so the rest of the code can treat these
 * as guaranteed-present typed values.
 */
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  // Refresh-token lifetime in days (SRS §6.1 default: 7).
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  // Uploads (Module 4)
  UPLOAD_PROVIDER: z.enum(['local']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),

  // Geospatial defaults (metres).
  NEARBY_DEFAULT_RADIUS_M: z.coerce.number().int().positive().default(1000),
  DUPLICATE_RADIUS_M: z.coerce.number().int().positive().default(200),

  // Rate limits (ABUSE-003).
  RATE_LIMIT_REPORTS_PER_HOUR: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_COMMENTS_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AUTH_PER_15MIN: z.coerce.number().int().positive().default(10),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
