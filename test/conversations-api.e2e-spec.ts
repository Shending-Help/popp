import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, TEST_API_TOKEN } from './support/app';
import { resetDatabase } from './support/database';

let app: INestApplication;
let prisma: PrismaClient;

const auth = (r: request.Test) => r.set('Authorization', `Bearer ${TEST_API_TOKEN}`);

beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
afterAll(async () => { await app.close(); });

beforeEach(async () => {
  await resetDatabase(prisma);
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

describe('auth', () => {
  it('401s without a token', async () => {
    await request(app.getHttpServer()).get('/conversations').expect(401);
  });

  it('401s with a wrong token', async () => {
    await request(app.getHttpServer())
      .get('/conversations').set('Authorization', 'Bearer nope').expect(401);
  });

  it('leaves /health unauthenticated', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});

describe('GET /conversations', () => {
  it('returns all conversations with meta', async () => {
    const res = await auth(request(app.getHttpServer()).get('/conversations')).expect(200);
    expect(res.body.data).toHaveLength(5);
    expect(res.body.meta).toMatchObject({ count: 5, next_cursor: null });
  });

  it('filters by status', async () => {
    const res = await auth(
      request(app.getHttpServer()).get('/conversations?status=COMPLETED'),
    ).expect(200);
    expect(res.body.data).toHaveLength(2);
  });

  it('filters by candidate_id', async () => {
    const res = await auth(
      request(app.getHttpServer()).get('/conversations?candidate_id=c3'),
    ).expect(200);
    expect(res.body.data).toHaveLength(1);
  });

  // Silently ignoring an unrecognised filter is how internal callers ship bugs
  // that look like missing data.
  it('400s on an invalid status rather than returning an empty list', async () => {
    await auth(request(app.getHttpServer()).get('/conversations?status=BANANA')).expect(400);
  });

  it('400s on a limit above the maximum', async () => {
    await auth(request(app.getHttpServer()).get('/conversations?limit=1000')).expect(400);
  });

  it('paginates with a cursor without repeating rows', async () => {
    const first = await auth(request(app.getHttpServer()).get('/conversations?limit=2')).expect(200);
    expect(first.body.data).toHaveLength(2);
    expect(first.body.meta.next_cursor).not.toBeNull();

    const second = await auth(
      request(app.getHttpServer()).get(`/conversations?limit=2&cursor=${first.body.meta.next_cursor}`),
    ).expect(200);

    const ids = [...first.body.data, ...second.body.data].map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('GET /conversations/:id', () => {
  it('returns a single conversation in the documented shape', async () => {
    const seeded = await prisma.conversation.findFirstOrThrow();
    const res = await auth(
      request(app.getHttpServer()).get(`/conversations/${seeded.id}`),
    ).expect(200);
    expect(res.body).toMatchObject({ id: seeded.id, candidate_id: seeded.candidateId });
    expect(res.body).not.toHaveProperty('candidateId');
  });

  it('404s for an unknown id', async () => {
    await auth(request(app.getHttpServer())
      .get('/conversations/11111111-1111-1111-1111-111111111111')).expect(404);
  });
});
