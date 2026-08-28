import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'must be a postgres connection string'),
  WEBHOOK_SIGNING_SECRET: z.string().min(16, 'must be at least 16 characters'),
  API_TOKEN: z.string().min(16, 'must be at least 16 characters'),
  STRICT_PHONE_VALIDATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),
  LOG_LEVEL: z.enum(['error', 'warn', 'log', 'debug', 'verbose']).default('log'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Fails fast at boot with EVERY problem listed, not just the first.
 * A half-configured service that starts and then 500s on the first webhook
 * is strictly worse than one that refuses to start.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
