import { ConversationsRepository } from '../src/conversations/conversations.repository';
import { ConcurrentModificationError } from '../src/common/errors/domain-errors';
import { createTestPrismaClient, resetDatabase } from './support/database';

const prisma = createTestPrismaClient();
const repo = new ConversationsRepository(prisma as never);

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.candidate.create({
    data: { id: 'cand-1', phoneNumber: '+447700900123', firstName: 'Jane',
            lastName: 'Doe', emailAddress: 'jane@example.com' },
  });
});

const base = { applicationId: 'app-1', candidateId: 'cand-1', jobId: 'job-1' };

describe('create — constraint violations map to named domain errors', () => {
  it('creates a conversation in CREATED', async () => {
    const c = await repo.create(prisma, base);
    expect(c.status).toBe('CREATED');
    expect(c.version).toBe(0);
  });

  it('maps a duplicate application_id to constraint APPLICATION', async () => {
    await repo.create(prisma, base);
    await expect(repo.create(prisma, { ...base, jobId: 'job-2' }))
      .rejects.toMatchObject({ constraint: 'APPLICATION' });
  });

  it('maps a duplicate candidate+job to constraint CANDIDATE_JOB', async () => {
    await repo.create(prisma, base);
    await expect(repo.create(prisma, { ...base, applicationId: 'app-2' }))
      .rejects.toMatchObject({ constraint: 'CANDIDATE_JOB' });
  });

  it('maps a second active conversation to constraint ACTIVE_CANDIDATE', async () => {
    await repo.create(prisma, base);
    await expect(repo.create(prisma, { applicationId: 'app-2', candidateId: 'cand-1', jobId: 'job-2' }))
      .rejects.toMatchObject({ constraint: 'ACTIVE_CANDIDATE' });
  });
});

describe('findByApplicationId', () => {
  it('returns the matching conversation', async () => {
    const c = await repo.create(prisma, base);
    const found = await repo.findByApplicationId(prisma, base.applicationId);
    expect(found?.id).toBe(c.id);
  });

  it('returns null when no conversation has that application id', async () => {
    const found = await repo.findByApplicationId(prisma, 'no-such-app');
    expect(found).toBeNull();
  });
});

describe('findByCandidateAndJob', () => {
  it('returns the matching conversation', async () => {
    const c = await repo.create(prisma, base);
    const found = await repo.findByCandidateAndJob(prisma, base.candidateId, base.jobId);
    expect(found?.id).toBe(c.id);
  });

  it('returns null when the candidate has no conversation for that job', async () => {
    await repo.create(prisma, base);
    const found = await repo.findByCandidateAndJob(prisma, base.candidateId, 'no-such-job');
    expect(found).toBeNull();
  });
});

describe('findActiveByCandidate', () => {
  it('finds a CREATED conversation', async () => {
    const c = await repo.create(prisma, base);
    const found = await repo.findActiveByCandidate(prisma, base.candidateId);
    expect(found?.id).toBe(c.id);
  });

  it('finds an ONGOING conversation', async () => {
    const c = await repo.create(prisma, base);
    await repo.transition(c.id, c.version, 'ONGOING');
    const found = await repo.findActiveByCandidate(prisma, base.candidateId);
    expect(found?.id).toBe(c.id);
    expect(found?.status).toBe('ONGOING');
  });

  it('returns null when the candidate only has a COMPLETED conversation', async () => {
    const c = await repo.create(prisma, base);
    await repo.transition(c.id, c.version, 'ONGOING');
    await repo.transition(c.id, c.version + 1, 'COMPLETED');
    const found = await repo.findActiveByCandidate(prisma, base.candidateId);
    expect(found).toBeNull();
  });

  it('returns null for a candidate with no conversations at all', async () => {
    const found = await repo.findActiveByCandidate(prisma, 'no-such-candidate');
    expect(found).toBeNull();
  });
});

describe('transition — optimistic locking', () => {
  it('applies a transition and increments version', async () => {
    const c = await repo.create(prisma, base);
    const updated = await repo.transition(c.id, c.version, 'ONGOING');
    expect(updated.status).toBe('ONGOING');
    expect(updated.version).toBe(1);
  });

  // The write and the read-back that builds the return value are one raw
  // statement (UPDATE ... RETURNING), not two — this pins the exact record
  // this call produced, not just that *some* transition eventually landed.
  it('returns a record reflecting exactly this call\'s outcome', async () => {
    const c = await repo.create(prisma, base);
    const updated = await repo.transition(c.id, c.version, 'ONGOING');
    expect(updated.id).toBe(c.id);
    expect(updated.status).toBe('ONGOING');
    expect(updated.version).toBe(c.version + 1);
    expect(updated.applicationId).toBe(base.applicationId);
    expect(updated.candidateId).toBe(base.candidateId);
    expect(updated.jobId).toBe(base.jobId);
  });

  it('rejects a stale version', async () => {
    const c = await repo.create(prisma, base);
    await repo.transition(c.id, 0, 'ONGOING');
    await expect(repo.transition(c.id, 0, 'COMPLETED'))
      .rejects.toBeInstanceOf(ConcurrentModificationError);
  });

  it('lets exactly one of two concurrent transitions win', async () => {
    const c = await repo.create(prisma, base);
    const results = await Promise.allSettled([
      repo.transition(c.id, 0, 'ONGOING'),
      repo.transition(c.id, 0, 'ONGOING'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});

describe('list — filtering and cursor pagination', () => {
  beforeEach(async () => {
    for (let i = 0; i < 5; i++) {
      await prisma.candidate.create({
        data: { id: `c${i}`, phoneNumber: '+447700900123', firstName: 'A',
                lastName: 'B', emailAddress: 'a@b.com' },
      });
      await prisma.conversation.create({
        data: { applicationId: `a${i}`, candidateId: `c${i}`, jobId: `j${i}`,
                status: i % 2 === 0 ? 'CREATED' : 'COMPLETED' },
      });
    }
  });

  it('filters by status', async () => {
    const { items } = await repo.list({ status: 'COMPLETED', limit: 50 });
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === 'COMPLETED')).toBe(true);
  });

  it('filters by candidate_id', async () => {
    const { items } = await repo.list({ candidateId: 'c3', limit: 50 });
    expect(items).toHaveLength(1);
  });

  it('paginates without repeating or dropping rows', async () => {
    const first = await repo.list({ limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).not.toBeNull();

    const second = await repo.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.items).toHaveLength(2);

    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('returns a null cursor on the last page', async () => {
    const { nextCursor } = await repo.list({ limit: 50 });
    expect(nextCursor).toBeNull();
  });
});
