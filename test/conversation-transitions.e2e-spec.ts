import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { createTestApp, TEST_API_TOKEN } from './support/app';
import { resetDatabase } from './support/database';

let app: INestApplication;
let prisma: PrismaClient;
let conversationId: string;

const patch = (id: string, body: Record<string, unknown>) =>
  request(app.getHttpServer())
    .patch(`/conversations/${id}/status`)
    .set('Authorization', `Bearer ${TEST_API_TOKEN}`)
    .send(body);

beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
afterAll(async () => { await app.close(); });

beforeEach(async () => {
  await resetDatabase(prisma);
  await prisma.candidate.create({
    data: { id: 'cand-1', phoneNumber: '+447700900123', firstName: 'Jane',
            lastName: 'Doe', emailAddress: 'jane@example.com' },
  });
  const c = await prisma.conversation.create({
    data: { applicationId: 'app-1', candidateId: 'cand-1', jobId: 'job-1' },
  });
  conversationId = c.id;
});

describe('PATCH /conversations/:id/status', () => {
  it('applies CREATED -> ONGOING and increments version', async () => {
    const res = await patch(conversationId, { status: 'ONGOING', version: 0 }).expect(200);
    expect(res.body).toMatchObject({ status: 'ONGOING', version: 1 });
  });

  it('walks the full lifecycle to COMPLETED', async () => {
    await patch(conversationId, { status: 'ONGOING', version: 0 }).expect(200);
    const res = await patch(conversationId, { status: 'COMPLETED', version: 1 }).expect(200);
    expect(res.body.status).toBe('COMPLETED');
  });

  // 422 means "never try this again" — retrying cannot help.
  it('422s on an illegal transition', async () => {
    await patch(conversationId, { status: 'ONGOING', version: 0 }).expect(200);
    await patch(conversationId, { status: 'COMPLETED', version: 1 }).expect(200);
    const res = await patch(conversationId, { status: 'ONGOING', version: 2 }).expect(422);
    expect(res.body.error).toBe('ILLEGAL_TRANSITION');
  });

  it('422s on CREATED -> COMPLETED, which is deliberately excluded', async () => {
    await patch(conversationId, { status: 'COMPLETED', version: 0 }).expect(422);
  });

  // 409 means "re-read and try again" — retrying CAN succeed.
  it('409s on a stale version', async () => {
    await patch(conversationId, { status: 'ONGOING', version: 0 }).expect(200);
    const res = await patch(conversationId, { status: 'COMPLETED', version: 0 }).expect(409);
    expect(res.body.error).toBe('CONCURRENT_MODIFICATION');
  });

  it('treats a redelivered same-status transition as a 200 no-op', async () => {
    await patch(conversationId, { status: 'ONGOING', version: 0 }).expect(200);
    const res = await patch(conversationId, { status: 'ONGOING', version: 1 }).expect(200);
    expect(res.body).toMatchObject({ status: 'ONGOING', version: 1 });
  });

  it('404s for an unknown conversation', async () => {
    await patch('11111111-1111-1111-1111-111111111111', { status: 'ONGOING', version: 0 })
      .expect(404);
  });

  it('400s when version is missing — an optional version would silently become last-write-wins', async () => {
    await patch(conversationId, { status: 'ONGOING' }).expect(400);
  });

  it('400s on an unknown status value', async () => {
    await patch(conversationId, { status: 'BANANA', version: 0 }).expect(400);
  });

  it('401s without a token', async () => {
    await request(app.getHttpServer())
      .patch(`/conversations/${conversationId}/status`)
      .send({ status: 'ONGOING', version: 0 })
      .expect(401);
  });

  it('lets exactly one of two concurrent identical transitions win', async () => {
    const [a, b] = await Promise.all([
      patch(conversationId, { status: 'ONGOING', version: 0 }),
      patch(conversationId, { status: 'ONGOING', version: 0 }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const row = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    expect(row.version).toBe(1);
  });
});
