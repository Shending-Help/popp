import { ConversationsService } from '../src/conversations/conversations.service';
import { ConversationsRepository } from '../src/conversations/conversations.repository';
import { CandidatesRepository } from '../src/candidates/candidates.repository';
import { CreateConversationResult } from '../src/conversations/domain/types';
import { createTestPrismaClient, resetDatabase } from './support/database';

// This is the regression coverage the design's central claim depends on: the
// pre-check is an optimisation for good error messages, the unique indexes
// are the actual guarantee. A fake $transaction (as in the unit spec) has no
// abort semantics and can't tell the difference between resolveLostRace
// re-reading on the aborted `tx` (which throws 25P02 under real Postgres)
// and re-reading on a fresh connection (which is what's implemented). Only a
// real concurrent race against real Postgres can catch that regression, and
// only here, in the same task/file that implements the behaviour -- Task
// 10's webhook test asserts "no 5xx" at the HTTP boundary, which would blame
// a Task 9 regression on Task 10 instead of localizing it.
const prisma = createTestPrismaClient();
const conversations = new ConversationsRepository(prisma as never);
const candidates = new CandidatesRepository();
const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
const config = { get: jest.fn().mockReturnValue(false) };

function buildService(): ConversationsService {
  return new ConversationsService(
    prisma as never, conversations, candidates, dispatcher as never, config as never,
  );
}

function isFulfilled<T>(r: PromiseSettledResult<T>): r is PromiseFulfilledResult<T> {
  return r.status === 'fulfilled';
}

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => {
  await resetDatabase(prisma);
  dispatcher.dispatch.mockClear();
});

const candidateContact = {
  phoneNumber: '+447700900123', firstName: 'Jane', lastName: 'Doe', emailAddress: 'jane@example.com',
};

const CONCURRENCY = 10;

describe('ConversationsService.createFromApplication — concurrent races resolve to the pre-check outcome', () => {
  // An identical payload shares application_id, candidate_id, AND job_id, so
  // a losing transaction's create() can be rejected on any of the three
  // unique indexes depending on timing -- and (independently of
  // resolveLostRace) the three sequential pre-check SELECTs don't share one
  // snapshot under READ COMMITTED, so a concurrent commit landing between
  // e.g. the R3 and R2 reads could, in principle, make R2 "see" the winner
  // before R3 does and return DUPLICATE_APPLICATION where REPLAYED is
  // truthful. createFromApplication closes this by re-reading
  // findByApplicationId before finalizing either SKIPPED branch: if R2 (or
  // R1) just hit, the winner necessarily committed before that read began,
  // so a later R3 re-read -- a still-later statement under READ COMMITTED --
  // is guaranteed to see it too. This test pins the exact label the
  // monotonicity fix promises: every loser is REPLAYED, not merely
  // "resolves to the same conversation."
  it('(a) N identical deliveries of the same application_id: exactly one CREATED, the rest REPLAYED, zero rejections', async () => {
    const service = buildService();
    const payload = {
      applicationId: 'app-race-a', candidateId: 'cand-race-a', jobId: 'job-race-a',
      candidate: candidateContact,
    };

    const settled = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => service.createFromApplication(payload)),
    );

    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(0);

    const results = settled.filter(isFulfilled<CreateConversationResult>).map((r) => r.value);
    expect(results.filter((r) => r.outcome === 'CREATED')).toHaveLength(1);
    expect(results.filter((r) => r.outcome === 'REPLAYED')).toHaveLength(CONCURRENCY - 1);

    expect(await prisma.conversation.count({ where: { applicationId: payload.applicationId } })).toBe(1);
  });

  // The one that fails loudly with 25P02 if resolveLostRace's re-read ever
  // moves back onto the (by-then-aborted) transaction client.
  it('(b) N deliveries for one candidate across different jobs: exactly one CREATED, the rest SKIPPED/ACTIVE_CONVERSATION_EXISTS, zero rejections', async () => {
    const service = buildService();
    const candidateId = 'cand-race-b';
    const payloads = Array.from({ length: CONCURRENCY }, (_, i) => ({
      applicationId: `app-race-b-${i}`, candidateId, jobId: `job-race-b-${i}`,
      candidate: candidateContact,
    }));

    const settled = await Promise.allSettled(payloads.map((p) => service.createFromApplication(p)));

    const rejected = settled.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(0);

    const results = settled.filter(isFulfilled<CreateConversationResult>).map((r) => r.value);
    expect(results.filter((r) => r.outcome === 'CREATED')).toHaveLength(1);

    const skipped = results.filter((r) => r.outcome === 'SKIPPED');
    expect(skipped).toHaveLength(CONCURRENCY - 1);
    expect(skipped.every((r) => r.outcome === 'SKIPPED' && r.reason === 'ACTIVE_CONVERSATION_EXISTS')).toBe(true);

    expect(await prisma.conversation.count({ where: { candidateId } })).toBe(1);
  });
});
