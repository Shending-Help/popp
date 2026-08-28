import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CandidatesRepository } from '../candidates/candidates.repository';
import { ConversationsRepository, ListFilter } from './conversations.repository';
import {
  DOMAIN_EVENT_DISPATCHER, DomainEventDispatcher,
} from '../events/domain-event';
import {
  ConversationConflictError, ConversationNotFoundError, InvalidPhoneNumberError,
} from '../common/errors/domain-errors';
import { validatePhoneNumber } from './domain/phone';
import { assertTransition } from './domain/state-machine';
import { ConversationStatus } from './domain/status';
import { ConversationRecord, CreateConversationResult } from './domain/types';

export interface ApplicationEventInput {
  applicationId: string;
  candidateId: string;
  jobId: string;
  candidate: {
    phoneNumber: string; firstName: string; lastName: string; emailAddress: string;
  };
}

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsRepository,
    private readonly candidates: CandidatesRepository,
    @Inject(DOMAIN_EVENT_DISPATCHER) private readonly events: DomainEventDispatcher,
    private readonly config: ConfigService,
  ) {}

  async createFromApplication(input: ApplicationEventInput): Promise<CreateConversationResult> {
    const strict = this.config.get<boolean>('STRICT_PHONE_VALIDATION') ?? false;
    const phone = validatePhoneNumber(input.candidate.phoneNumber, { strict });
    if (!phone.ok) throw new InvalidPhoneNumberError(phone.reason);
    if (!phone.plausible) {
      this.logger.warn(
        `Phone number for candidate ${input.candidateId} is valid E.164 but not plausible ` +
        `(STRICT_PHONE_VALIDATION is off)`,
      );
    }

    let result: CreateConversationResult;
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // Pre-checks, most specific first, so the reason returned is the most
        // informative one available. These produce good messages on the common
        // path; they are NOT what makes the rules true. See the catch below.
        const replay = await this.conversations.findByApplicationId(tx, input.applicationId);
        if (replay) return { outcome: 'REPLAYED' as const, conversation: replay };

        const sameJob = await this.conversations.findByCandidateAndJob(
          tx, input.candidateId, input.jobId,
        );
        if (sameJob) {
          return {
            outcome: 'SKIPPED' as const,
            reason: 'DUPLICATE_APPLICATION' as const,
            conversationId: sameJob.id,
          };
        }

        const active = await this.conversations.findActiveByCandidate(tx, input.candidateId);
        if (active) {
          return {
            outcome: 'SKIPPED' as const,
            reason: 'ACTIVE_CONVERSATION_EXISTS' as const,
            conversationId: active.id,
          };
        }

        await this.candidates.upsert(tx, {
          candidateId: input.candidateId,
          phoneNumber: phone.e164,
          firstName: input.candidate.firstName,
          lastName: input.candidate.lastName,
          emailAddress: input.candidate.emailAddress,
        });

        // Deliberately NOT caught here. Postgres aborts the whole transaction
        // on any statement error (25P02: "current transaction is aborted")
        // until it is rolled back, so a query issued on `tx` after a caught
        // P2002 would itself fail -- it cannot be used to resolve the race.
        // Letting this propagate lets Prisma roll the transaction back
        // cleanly; resolution happens below, on a fresh connection.
        const conversation = await this.conversations.create(tx, {
          applicationId: input.applicationId,
          candidateId: input.candidateId,
          jobId: input.jobId,
        });
        return { outcome: 'CREATED' as const, conversation };
      });
    } catch (error) {
      if (error instanceof ConversationConflictError) {
        // We lost a race: a concurrent delivery inserted first, and our own
        // transaction (pre-checks, candidate upsert, and attempted create)
        // was rolled back in full. The database caught what the pre-check
        // could not; resolve to exactly the outcome the pre-check would have
        // produced, reading fresh (outside the now-aborted transaction).
        result = await this.resolveLostRace(input, error);
      } else {
        throw error;
      }
    }

    if (result.outcome === 'CREATED') {
      await this.events.dispatch({
        type: 'conversation.created',
        conversationId: result.conversation.id,
        candidateId: result.conversation.candidateId,
        jobId: result.conversation.jobId,
        occurredAt: new Date(),
      });
    }
    return result;
  }

  // Keyed exhaustively off error.constraint, one branch per index, each
  // ending in either the outcome that constraint implies or a rethrow. A
  // P2002 on APPLICATION implies a committed winner for that application_id;
  // if the re-read still can't find it, something is wrong in a way this
  // method has no business papering over by falling through to a *different*
  // rule's outcome (that would silently swap REPLAYED for SKIPPED, exactly
  // the R3/R1 conflation the webhook contract must keep apart).
  private async resolveLostRace(
    input: ApplicationEventInput,
    error: ConversationConflictError,
  ): Promise<CreateConversationResult> {
    switch (error.constraint) {
      case 'APPLICATION': {
        const existing = await this.conversations.findByApplicationId(this.prisma, input.applicationId);
        if (existing) return { outcome: 'REPLAYED', conversation: existing };
        throw error;
      }
      case 'CANDIDATE_JOB': {
        const existing = await this.conversations.findByCandidateAndJob(
          this.prisma, input.candidateId, input.jobId,
        );
        if (existing) {
          return { outcome: 'SKIPPED', reason: 'DUPLICATE_APPLICATION', conversationId: existing.id };
        }
        throw error;
      }
      case 'ACTIVE_CANDIDATE': {
        const active = await this.conversations.findActiveByCandidate(this.prisma, input.candidateId);
        if (active) {
          return { outcome: 'SKIPPED', reason: 'ACTIVE_CONVERSATION_EXISTS', conversationId: active.id };
        }
        throw error;
      }
    }
  }

  async getById(id: string): Promise<ConversationRecord> {
    const found = await this.conversations.findById(id);
    if (!found) throw new ConversationNotFoundError(id);
    return found;
  }

  async list(filter: ListFilter) {
    return this.conversations.list(filter);
  }

  async changeStatus(
    id: string,
    next: ConversationStatus,
    expectedVersion: number,
  ): Promise<ConversationRecord> {
    const current = await this.getById(id);

    // Throws IllegalTransitionError (-> 422) for an impossible move; returns
    // NOOP for a redelivered one.
    if (assertTransition(current.status, next) === 'NOOP') return current;

    const updated = await this.conversations.transition(id, expectedVersion, next);
    await this.events.dispatch({
      type: 'conversation.status_changed',
      conversationId: updated.id,
      from: current.status,
      to: updated.status,
      occurredAt: new Date(),
    });
    return updated;
  }
}
