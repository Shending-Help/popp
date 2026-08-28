import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ConcurrentModificationError, ConversationConflictError } from '../common/errors/domain-errors';
import { ConversationStatus } from './domain/status';
import { ConversationRecord } from './domain/types';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ListFilter {
  status?: ConversationStatus;
  candidateId?: string;
  jobId?: string;
  limit: number;
  cursor?: string;
}

type Row = {
  id: string; applicationId: string; candidateId: string; jobId: string;
  status: string; version: number; createdAt: Date; updatedAt: Date;
};

function toRecord(row: Row): ConversationRecord {
  return { ...row, status: row.status as ConversationStatus };
}

/**
 * Maps a Postgres unique violation to the rule it violated.
 *
 * Prisma reports the offending index in `meta.target`. Empirically (verified
 * with a scratch run against this schema — see task-7-report.md), all three
 * constraints come back as an ARRAY OF SNAKE_CASE DB COLUMN NAMES, not the
 * Prisma field names and not the index name string:
 *   - conversations_application_id_key          -> ["application_id"]
 *   - conversations_candidate_job_key            -> ["candidate_id", "job_id"]
 *   - conversations_one_active_per_candidate     -> ["candidate_id"]
 * The partial index and the (candidateId, jobId) index both mention
 * candidate_id, so they can only be told apart by whether job_id is ALSO
 * present — order of the checks below matters. Field names are checked in
 * both snake_case and camelCase in case Prisma's reporting shape differs
 * across versions or constraint declarations; substring matching on the
 * hand-authored index's own name is kept as a defensive fallback in case a
 * future Prisma version reports it that way instead.
 *
 * The integration tests are the source of truth here — if Prisma reports a
 * shape this does not handle, fix the matcher, not the test.
 */
function mapUniqueViolation(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
    const key = fields.join(',');

    const hasApplication = fields.some((f) => f === 'application_id' || f === 'applicationId');
    const hasCandidate = fields.some((f) => f === 'candidate_id' || f === 'candidateId');
    const hasJob = fields.some((f) => f === 'job_id' || f === 'jobId');

    if (hasApplication) {
      throw new ConversationConflictError('APPLICATION');
    }
    // Check the two-column constraint before the single-column partial index:
    // both mention candidate_id, and only the presence of job_id tells them apart.
    if (hasCandidate && hasJob) {
      throw new ConversationConflictError('CANDIDATE_JOB');
    }
    if (hasCandidate || key.includes('one_active_per_candidate')) {
      throw new ConversationConflictError('ACTIVE_CANDIDATE');
    }
    // A unique violation we did not anticipate: surface it rather than
    // silently mislabeling it as one of the known rules.
    throw error;
  }
  throw error;
}

@Injectable()
export class ConversationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByApplicationId(db: Db, applicationId: string): Promise<ConversationRecord | null> {
    const row = await db.conversation.findUnique({ where: { applicationId } });
    return row ? toRecord(row) : null;
  }

  async findActiveByCandidate(db: Db, candidateId: string): Promise<ConversationRecord | null> {
    const row = await db.conversation.findFirst({
      where: { candidateId, status: { in: ['CREATED', 'ONGOING'] } },
    });
    return row ? toRecord(row) : null;
  }

  async findByCandidateAndJob(db: Db, candidateId: string, jobId: string): Promise<ConversationRecord | null> {
    const row = await db.conversation.findUnique({
      where: { candidateId_jobId: { candidateId, jobId } },
    });
    return row ? toRecord(row) : null;
  }

  async create(
    db: Db,
    input: { applicationId: string; candidateId: string; jobId: string },
  ): Promise<ConversationRecord> {
    try {
      const row = await db.conversation.create({ data: { ...input, status: 'CREATED' } });
      return toRecord(row);
    } catch (error) {
      return mapUniqueViolation(error);
    }
  }

  async findById(id: string): Promise<ConversationRecord | null> {
    const row = await this.prisma.conversation.findUnique({ where: { id } });
    return row ? toRecord(row) : null;
  }

  async list(f: ListFilter): Promise<{ items: ConversationRecord[]; nextCursor: string | null }> {
    const rows = await this.prisma.conversation.findMany({
      where: {
        ...(f.status ? { status: f.status } : {}),
        ...(f.candidateId ? { candidateId: f.candidateId } : {}),
        ...(f.jobId ? { jobId: f.jobId } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: f.limit + 1,                                    // one extra reveals "is there more"
      ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > f.limit;
    const page = hasMore ? rows.slice(0, f.limit) : rows;
    return {
      items: page.map(toRecord),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  /**
   * Optimistic locking. The affected-row count IS the concurrency check:
   * read-check-write collapses into one atomic statement, so two workers that
   * both read version N cannot both succeed.
   */
  async transition(
    id: string,
    expectedVersion: number,
    next: ConversationStatus,
  ): Promise<ConversationRecord> {
    const { count } = await this.prisma.conversation.updateMany({
      where: { id, version: expectedVersion },
      data: { status: next, version: { increment: 1 } },
    });
    if (count === 0) throw new ConcurrentModificationError(id);

    const row = await this.prisma.conversation.findUniqueOrThrow({ where: { id } });
    return toRecord(row);
  }
}
