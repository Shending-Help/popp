import { ConversationsService } from './conversations.service';
import { ConversationConflictError, ConversationNotFoundError } from '../common/errors/domain-errors';
import { ConversationRecord } from './domain/types';

const record = (over: Partial<ConversationRecord> = {}): ConversationRecord => ({
  id: 'conv-1', applicationId: 'app-1', candidateId: 'cand-1', jobId: 'job-1',
  status: 'CREATED', version: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
});

const payload = {
  applicationId: 'app-1', candidateId: 'cand-1', jobId: 'job-1',
  candidate: { phoneNumber: '+447700900123', firstName: 'Jane',
               lastName: 'Doe', emailAddress: 'jane@example.com' },
};

function build(overrides: Partial<Record<string, jest.Mock>> = {}) {
  const conversations = {
    findByApplicationId: jest.fn().mockResolvedValue(null),
    findByCandidateAndJob: jest.fn().mockResolvedValue(null),
    findActiveByCandidate: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue(record()),
    findById: jest.fn(), list: jest.fn(), transition: jest.fn(),
    ...overrides,
  };
  const candidates = { upsert: jest.fn().mockResolvedValue(undefined) };
  const prisma = { $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb({})) };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn().mockReturnValue(false) };
  const service = new ConversationsService(
    prisma as never, conversations as never, candidates as never,
    dispatcher as never, config as never,
  );
  return { service, conversations, candidates, dispatcher };
}

describe('createFromApplication', () => {
  it('creates a conversation and emits conversation.created', async () => {
    const { service, dispatcher } = build();
    const result = await service.createFromApplication(payload);
    expect(result).toMatchObject({ outcome: 'CREATED' });
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation.created' }),
    );
  });

  it('R3: returns REPLAYED for a known application_id without creating', async () => {
    const { service, conversations, dispatcher } = build({
      findByApplicationId: jest.fn().mockResolvedValue(record()),
    });
    const result = await service.createFromApplication(payload);
    expect(result).toMatchObject({ outcome: 'REPLAYED' });
    expect(conversations.create).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('R2: returns SKIPPED/DUPLICATE_APPLICATION when candidate already applied to this job', async () => {
    const { service } = build({
      findByCandidateAndJob: jest.fn().mockResolvedValue(record({ status: 'COMPLETED' })),
    });
    expect(await service.createFromApplication(payload))
      .toMatchObject({ outcome: 'SKIPPED', reason: 'DUPLICATE_APPLICATION' });
  });

  it('R1: returns SKIPPED/ACTIVE_CONVERSATION_EXISTS when an active conversation exists', async () => {
    const { service } = build({
      findActiveByCandidate: jest.fn().mockResolvedValue(record({ id: 'other', jobId: 'job-9' })),
    });
    expect(await service.createFromApplication(payload))
      .toMatchObject({ outcome: 'SKIPPED', reason: 'ACTIVE_CONVERSATION_EXISTS' });
  });

  it('checks R3 before R2 so the most specific reason wins', async () => {
    const { service } = build({
      findByApplicationId: jest.fn().mockResolvedValue(record()),
      findByCandidateAndJob: jest.fn().mockResolvedValue(record()),
    });
    expect(await service.createFromApplication(payload)).toMatchObject({ outcome: 'REPLAYED' });
  });

  it('checks R2 before R1 so the more specific reason wins', async () => {
    const { service } = build({
      findByCandidateAndJob: jest.fn().mockResolvedValue(record()),
      findActiveByCandidate: jest.fn().mockResolvedValue(record({ id: 'other', jobId: 'job-9' })),
    });
    expect(await service.createFromApplication(payload))
      .toMatchObject({ outcome: 'SKIPPED', reason: 'DUPLICATE_APPLICATION' });
  });

  it('rejects an invalid phone number before touching the database', async () => {
    const { service, candidates } = build();
    await expect(service.createFromApplication({
      ...payload, candidate: { ...payload.candidate, phoneNumber: '07700900123' },
    })).rejects.toThrow(/phone/i);
    expect(candidates.upsert).not.toHaveBeenCalled();
  });

  // The pre-check is an optimisation; the index is the guarantee. When a
  // concurrent insert wins the race, the constraint violation must produce the
  // SAME outcome the pre-check would have produced.
  it('translates a losing race on the active-candidate index into the same SKIPPED outcome', async () => {
    const { service } = build({
      create: jest.fn().mockRejectedValue(new ConversationConflictError('ACTIVE_CANDIDATE')),
      findActiveByCandidate: jest.fn()
        .mockResolvedValueOnce(null)                       // pre-check passes
        .mockResolvedValueOnce(record({ id: 'winner' })),  // re-read after the violation
    });
    expect(await service.createFromApplication(payload))
      .toMatchObject({ outcome: 'SKIPPED', reason: 'ACTIVE_CONVERSATION_EXISTS', conversationId: 'winner' });
  });

  it('translates a losing race on the application index into REPLAYED', async () => {
    const { service } = build({
      create: jest.fn().mockRejectedValue(new ConversationConflictError('APPLICATION')),
      findByApplicationId: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(record({ id: 'winner' })),
    });
    expect(await service.createFromApplication(payload))
      .toMatchObject({ outcome: 'REPLAYED' });
  });

  // resolveLostRace must be keyed exhaustively off error.constraint. A P2002
  // on APPLICATION implies a committed winner for that application_id; if the
  // re-read still finds nothing, falling through to a different rule's
  // lookup (here, an unrelated active conversation) would silently swap the
  // truthful REPLAYED-or-throw answer for a wrong SKIPPED/ACTIVE_CONVERSATION_EXISTS
  // -- exactly the R3/R1 conflation the webhook contract must keep apart.
  it('rethrows the conflict rather than misreporting it via an unrelated lookup when the matching re-read is empty', async () => {
    const { service } = build({
      create: jest.fn().mockRejectedValue(new ConversationConflictError('APPLICATION')),
      findByApplicationId: jest.fn().mockResolvedValue(null),
      // Must NOT be consulted: an exhaustive resolveLostRace never reaches this
      // lookup for an APPLICATION conflict. Non-null here so the test would
      // fail loudly (SKIPPED/ACTIVE_CONVERSATION_EXISTS instead of a throw) if
      // that guarantee ever regressed. The R1 pre-check runs first regardless,
      // so it must pass (null) before create() is ever attempted.
      findActiveByCandidate: jest.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(record({ id: 'unrelated' })),
    });
    await expect(service.createFromApplication(payload)).rejects.toBeInstanceOf(ConversationConflictError);
  });
});

describe('getById', () => {
  it('throws ConversationNotFoundError for an unknown id', async () => {
    const { service } = build({ findById: jest.fn().mockResolvedValue(null) });
    await expect(service.getById('nope')).rejects.toBeInstanceOf(ConversationNotFoundError);
  });
});

describe('changeStatus', () => {
  it('applies a legal transition and emits an event', async () => {
    const { service, conversations, dispatcher } = build({
      findById: jest.fn().mockResolvedValue(record()),
      transition: jest.fn().mockResolvedValue(record({ status: 'ONGOING', version: 1 })),
    });
    const result = await service.changeStatus('conv-1', 'ONGOING', 0);
    expect(result.status).toBe('ONGOING');
    expect(conversations.transition).toHaveBeenCalledWith('conv-1', 0, 'ONGOING');
    expect(dispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation.status_changed', from: 'CREATED', to: 'ONGOING' }),
    );
  });

  it('short-circuits a same-status transition without writing or emitting', async () => {
    const { service, conversations, dispatcher } = build({
      findById: jest.fn().mockResolvedValue(record({ status: 'ONGOING' })),
    });
    const result = await service.changeStatus('conv-1', 'ONGOING', 0);
    expect(result.status).toBe('ONGOING');
    expect(conversations.transition).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('rejects an illegal transition before writing', async () => {
    const { service, conversations } = build({
      findById: jest.fn().mockResolvedValue(record({ status: 'COMPLETED' })),
    });
    await expect(service.changeStatus('conv-1', 'ONGOING', 0)).rejects.toThrow(/Illegal/);
    expect(conversations.transition).not.toHaveBeenCalled();
  });
});
