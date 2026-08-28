import { CandidatesRepository } from '../src/candidates/candidates.repository';
import { createTestPrismaClient, resetDatabase } from './support/database';

const prisma = createTestPrismaClient();
const repo = new CandidatesRepository();

const contact = {
  candidateId: 'cand-1', phoneNumber: '+447700900123', firstName: 'Jane',
  lastName: 'Doe', emailAddress: 'jane@example.com',
};

beforeAll(async () => { await prisma.$connect(); });
afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await resetDatabase(prisma); });

describe('CandidatesRepository.upsert', () => {
  it('inserts a candidate that does not exist', async () => {
    await repo.upsert(prisma, contact);
    const row = await prisma.candidate.findUniqueOrThrow({ where: { id: 'cand-1' } });
    expect(row.phoneNumber).toBe('+447700900123');
    expect(row.firstName).toBe('Jane');
  });

  it('updates contact details when the candidate already exists', async () => {
    await repo.upsert(prisma, contact);
    await repo.upsert(prisma, { ...contact, phoneNumber: '+447700900999', lastName: 'Smith' });
    const row = await prisma.candidate.findUniqueOrThrow({ where: { id: 'cand-1' } });
    expect(row.phoneNumber).toBe('+447700900999');
    expect(row.lastName).toBe('Smith');
    expect(await prisma.candidate.count()).toBe(1);
  });

  // Prisma's own upsert() has historically compiled to SELECT-then-INSERT,
  // which races. This must be a single ON CONFLICT statement.
  it('survives 10 concurrent upserts of the same candidate', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        repo.upsert(prisma, { ...contact, firstName: `Jane${i}` }),
      ),
    );
    expect(await prisma.candidate.count()).toBe(1);
  });
});
