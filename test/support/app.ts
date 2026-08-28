import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import type { AppModule as AppModuleType } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { PrismaService } from '../../src/prisma/prisma.service';
import { getTestDatabaseUrl } from './database';

export const TEST_SECRET = 'test-webhook-secret-16';
export const TEST_API_TOKEN = 'test-api-token-16chars';

export async function createTestApp(): Promise<{ app: INestApplication; prisma: PrismaClient }> {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.WEBHOOK_SIGNING_SECRET = TEST_SECRET;
  process.env.API_TOKEN = TEST_API_TOKEN;
  process.env.STRICT_PHONE_VALIDATION = 'false';

  // AppModule is imported dynamically, AFTER the env vars above are set.
  // ConfigModule.forRoot(...) runs as soon as its file is loaded (it's an
  // eager call inside the @Module decorator's argument, not deferred until
  // Nest instantiates anything), so a static top-level `import` here would
  // read the real .env file's secret before this function body ever runs.
  const { AppModule }: { AppModule: typeof AppModuleType } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ rawBody: true });
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();

  // PrismaClient itself is not a registered provider token — PrismaService
  // (which extends it) is what's in the container. See the brief's note.
  return { app, prisma: app.get(PrismaService) };
}
