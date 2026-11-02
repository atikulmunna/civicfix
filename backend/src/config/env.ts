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

  // Reverse proxies in front of the API whose X-Forwarded-For entries Express
  // trusts (Express `trust proxy`). 0 locally; 1 on Fly (its edge proxy).
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  // Shared with the web app's proxy (frontend/proxy.ts). When a request
  // carries it, the client IP forwarded by the web proxy is trusted for rate
  // limiting (see lib/client-ip.ts). Unset or empty disables that hop.
  PROXY_SHARED_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32, 'PROXY_SHARED_SECRET must be at least 32 chars').optional(),
  ),

  // Uploads (Module 4). `local` writes to LOCAL_UPLOAD_DIR (dev, tests);
  // `s3` writes to an S3-compatible bucket (production: Neon Object Storage).
  UPLOAD_PROVIDER: z.enum(['local', 's3']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 1024 * 1024),
  // Object storage (UPLOAD_PROVIDER=s3). AWS-standard names, exactly as
  // `neon env pull` writes them for a branch's bucket credentials.
  S3_BUCKET: z.string().min(1).optional(),
  AWS_ENDPOINT_URL_S3: z.url().optional(),
  AWS_REGION: z.string().min(1).optional(),
  AWS_ACCESS_KEY_ID: z.string().min(1).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(1).optional(),

  // Geospatial defaults (metres).
  NEARBY_DEFAULT_RADIUS_M: z.coerce.number().int().positive().default(1000),
  DUPLICATE_RADIUS_M: z.coerce.number().int().positive().default(200),

  // Rate limits (ABUSE-003).
  RATE_LIMIT_REPORTS_PER_HOUR: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_COMMENTS_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_AUTH_PER_15MIN: z.coerce.number().int().positive().default(10),
});

const S3_SETTINGS = [
  'S3_BUCKET',
  'AWS_ENDPOINT_URL_S3',
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
] as const;

// With UPLOAD_PROVIDER=s3, every bucket setting is required: fail at startup,
// not on the first upload.
const configSchema = schema.superRefine((cfg, ctx) => {
  if (cfg.UPLOAD_PROVIDER !== 's3') return;
  for (const key of S3_SETTINGS) {
    if (!cfg[key]) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'Required when UPLOAD_PROVIDER=s3' });
    }
  }
});

export type Env = z.infer<typeof configSchema>;

/** Validate a raw environment. Exported so the rules can be unit tested. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = configSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.map(String).join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
export const isProd = env.NODE_ENV === 'production';
