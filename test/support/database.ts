import { PrismaClient } from '@prisma/client';

export function getTestDatabaseUrl(): string {
  const url = process.env.__TEST_DATABASE_URL__ ?? process.env.DATABASE_URL;
  if (!url) throw new Error('No test database URL — is global-setup.ts running?');
  return url;
}

export function createTestPrismaClient(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: getTestDatabaseUrl() } } });
}

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "conversations", "candidates" RESTART IDENTITY CASCADE',
  );
}
