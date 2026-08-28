import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { buildSignatureHeader } from '../src/common/signature';
import { createTestApp, TEST_SECRET } from './support/app';
import { resetDatabase } from './support/database';

let app: INestApplication;
let prisma: PrismaClient;

const payload = (over: Record<string, unknown> = {}) => ({
  id: 'app-1', job_id: 'job-1', candidate_id: 'cand-1',
  candidate: {
    phone_number: '+1234567890',        // the brief's own example
    first_name: 'Jane', last_name: 'Doe', email_address: 'jane.doe@example.com',
  },
  ...over,
});

function post(body: unknown, secret = TEST_SECRET) {
  const raw = JSON.stringify(body);
  return request(app.getHttpServer())
    .post('/webhooks/applications')
    .set('Content-Type', 'application/json')
    .set('x-webhook-signature', buildSignatureHeader(secret, raw))
    .send(raw);
}

beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
afterAll(async () => { await app.close(); });
beforeEach(async () => { await resetDatabase(prisma); });

describe('POST /webhooks/applications — auth', () => {
  it('401s without a signature', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/applications').send(payload()).expect(401);
  });

  it('401s with a signature made from the wrong secret', async () => {
    await post(payload(), 'a-completely-wrong-secret').expect(401);
  });
});

describe('POST /webhooks/applications — happy path', () => {
  it('201s and creates a CREATED conversation', async () => {
    const res = await post(payload()).expect(201);
    expect(res.body.outcome).toBe('CREATED');
    expect(res.body.conversation).toMatchObject({
      candidate_id: 'cand-1', job_id: 'job-1', status: 'CREATED',
    });
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('stores the candidate with a normalized phone number', async () => {
    await post(payload()).expect(201);
    const c = await prisma.candidate.findUniqueOrThrow({ where: { id: 'cand-1' } });
    expect(c.phoneNumber).toBe('+1234567890');
  });

  it('returns snake_case keys exactly as documented', async () => {
    const res = await post(payload()).expect(201);
    expect(Object.keys(res.body.conversation)).toEqual(
      expect.arrayContaining(['id', 'candidate_id', 'job_id', 'status', 'created_at', 'updated_at']),
    );
  });
});

describe('POST /webhooks/applications — business rules', () => {
  it('R3: a redelivered application returns 200 REPLAYED and creates nothing new', async () => {
    await post(payload()).expect(201);
    const res = await post(payload()).expect(200);
    expect(res.body.outcome).toBe('REPLAYED');
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('R1: a second active conversation returns 200 SKIPPED', async () => {
    await post(payload()).expect(201);
    const res = await post(payload({ id: 'app-2', job_id: 'job-2' })).expect(200);
    expect(res.body).toMatchObject({
      outcome: 'SKIPPED', reason: 'ACTIVE_CONVERSATION_EXISTS',
    });
    expect(await prisma.conversation.count()).toBe(1);
  });

  it('R2: reapplying to the same job after COMPLETED returns 200 SKIPPED', async () => {
    await post(payload()).expect(201);
    await prisma.conversation.updateMany({ data: { status: 'COMPLETED' } });
    const res = await post(payload({ id: 'app-2' })).expect(200);
    expect(res.body).toMatchObject({ outcome: 'SKIPPED', reason: 'DUPLICATE_APPLICATION' });
  });

  it('allows a new job once the previous conversation is COMPLETED', async () => {
    await post(payload()).expect(201);
    await prisma.conversation.updateMany({ data: { status: 'COMPLETED' } });
    await post(payload({ id: 'app-2', job_id: 'job-2' })).expect(201);
    expect(await prisma.conversation.count()).toBe(2);
  });
});

describe('POST /webhooks/applications — validation', () => {
  it.each([
    ['missing id', { id: undefined }],
    ['missing job_id', { job_id: undefined }],
  ])('400s on %s', async (_label, over) => {
    await post(payload(over)).expect(400);
  });

  it('400s on a phone number that is not E.164', async () => {
    await post(payload({
      candidate: { phone_number: '07700900123', first_name: 'A', last_name: 'B',
                   email_address: 'a@b.com' },
    })).expect(400);
  });

  it('400s on a malformed email address', async () => {
    await post(payload({
      candidate: { phone_number: '+447700900123', first_name: 'A', last_name: 'B',
                   email_address: 'not-an-email' },
    })).expect(400);
  });

  it('ignores unknown fields rather than rejecting them', async () => {
    await post(payload({ source: 'greenhouse', extra: { nested: true } })).expect(201);
  });
});

// ── The headline test ────────────────────────────────────────────────────────
describe('concurrency', () => {
  it('creates exactly one conversation under 20 simultaneous identical deliveries', async () => {
    const responses = await Promise.all(Array.from({ length: 20 }, () => post(payload())));

    const created = responses.filter((r) => r.status === 201);
    const acknowledged = responses.filter((r) => r.status === 200);

    expect(created).toHaveLength(1);
    expect(acknowledged).toHaveLength(19);
    expect(await prisma.conversation.count()).toBe(1);

    // Nothing 5xx'd: every loser was a clean, deliberate business outcome.
    expect(responses.filter((r) => r.status >= 500)).toHaveLength(0);
  });

  it('creates exactly one conversation for 10 simultaneous DIFFERENT applications from one candidate', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) => post(payload({ id: `app-${i}`, job_id: `job-${i}` }))),
    );
    expect(responses.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.conversation.count()).toBe(1);   // R1 holds under load
  });
});
