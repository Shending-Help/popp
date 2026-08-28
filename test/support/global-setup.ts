import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

declare global {
  var __PG_CONTAINER__: StartedPostgreSqlContainer | undefined;
}

export default async function globalSetup() {
  // A real Postgres, because the unique indexes ARE the business rules.
  // Testing them against a mock or SQLite would prove nothing.
  const container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const url = container.getConnectionUri();

  process.env.DATABASE_URL = url;
  globalThis.__PG_CONTAINER__ = container;

  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: url }, stdio: 'inherit' });

  // Handed to the worker processes, which do not share this module's globals.
  process.env.__TEST_DATABASE_URL__ = url;
}
