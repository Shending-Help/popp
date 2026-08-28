import { parseEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgresql://popp:popp@localhost:5432/popp',
  WEBHOOK_SIGNING_SECRET: 'a-secret-at-least-16',
  API_TOKEN: 'a-token-at-least-16-chars',
};

describe('parseEnv', () => {
  it('applies documented defaults', () => {
    const env = parseEnv(valid as NodeJS.ProcessEnv);
    expect(env.PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.STRICT_PHONE_VALIDATION).toBe(false);
    expect(env.WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS).toBe(300);
  });

  it('coerces STRICT_PHONE_VALIDATION to a real boolean', () => {
    const env = parseEnv({ ...valid, STRICT_PHONE_VALIDATION: 'true' } as NodeJS.ProcessEnv);
    expect(env.STRICT_PHONE_VALIDATION).toBe(true);
  });

  it('throws listing every missing variable, not just the first', () => {
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({} as NodeJS.ProcessEnv)).toThrow(/API_TOKEN/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://x' } as NodeJS.ProcessEnv))
      .toThrow(/postgres/);
  });

  it('rejects a short signing secret', () => {
    expect(() => parseEnv({ ...valid, WEBHOOK_SIGNING_SECRET: 'short' } as NodeJS.ProcessEnv))
      .toThrow(/WEBHOOK_SIGNING_SECRET/);
  });
});
