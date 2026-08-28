import { PrismaClient } from '@prisma/client';
import { createTestPrismaClient, resetDatabase } from './support/database';

const prisma: PrismaClient = createTestPrismaClient();

const candidate = {
  id: 'cand-1', phoneNumber: '+447700900000', firstName: 'Jane',
  lastName: 'Doe', emailAddress: 'jane@example.com',
};

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.candidate.create({ data: candidate });
});

const conversation = (over: Partial<{ applicationId: string; jobId: string; status: 'CREATED' | 'ONGOING' | 'COMPLETED' }> = {}) => ({
  applicationId: over.applicationId ?? 'app-1',
  candidateId: 'cand-1',
  jobId: over.jobId ?? 'job-1',
  status: over.status ?? ('CREATED' as const),
});

describe('database invariants', () => {
  it('all three indexes exist', async () => {
    const rows = await prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'conversations'`;
    const names = rows.map((r) => r.indexname);
    expect(names).toEqual(expect.arrayContaining([
      'conversations_application_id_key',
      'conversations_candidate_job_key',
      'conversations_one_active_per_candidate',
    ]));
  });

  it('R3: rejects a duplicate application_id', async () => {
    await prisma.conversation.create({ data: conversation() });
    await expect(
      prisma.conversation.create({ data: conversation({ jobId: 'job-2' }) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('R2: rejects the same candidate applying to the same job twice', async () => {
    await prisma.conversation.create({ data: conversation({ status: 'COMPLETED' }) });
    await expect(
      prisma.conversation.create({ data: conversation({ applicationId: 'app-2' }) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('R1: rejects a second ACTIVE conversation for the same candidate on another job', async () => {
    await prisma.conversation.create({ data: conversation() });
    await expect(
      prisma.conversation.create({ data: conversation({ applicationId: 'app-2', jobId: 'job-2' }) }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('R1: allows a new conversation once the previous one is COMPLETED', async () => {
    await prisma.conversation.create({ data: conversation({ status: 'COMPLETED' }) });
    const next = await prisma.conversation.create({
      data: conversation({ applicationId: 'app-2', jobId: 'job-2' }),
    });
    expect(next.status).toBe('CREATED');
  });

  it('R1: a CREATED -> ONGOING transition does not fight the constraint', async () => {
    const c = await prisma.conversation.create({ data: conversation() });
    const updated = await prisma.conversation.update({
      where: { id: c.id }, data: { status: 'ONGOING' },
    });
    expect(updated.status).toBe('ONGOING');
  });
});
