import { ConversationStatus } from '../conversations/domain/status';

export type DomainEvent =
  | {
      type: 'conversation.created';
      conversationId: string; candidateId: string; jobId: string; occurredAt: Date;
    }
  | {
      type: 'conversation.status_changed';
      conversationId: string; from: ConversationStatus; to: ConversationStatus; occurredAt: Date;
    };

/**
 * The seam where downstream processes attach.
 *
 * The brief describes processes that generate the opening message and advance
 * the conversation to ONGOING, then eventually COMPLETED. Those processes are
 * out of scope, but the place they plug in should not be. Swapping the logging
 * implementation for one that publishes to SNS/SQS/Kafka is a one-line change
 * in EventsModule.
 *
 * The production-grade version of this is a transactional outbox: write the
 * event row in the SAME transaction as the conversation, then drain it with a
 * worker using SELECT ... FOR UPDATE SKIP LOCKED. That is deliberately out of
 * scope here — see the README.
 */
export interface DomainEventDispatcher {
  dispatch(event: DomainEvent): Promise<void>;
}

export const DOMAIN_EVENT_DISPATCHER = Symbol('DOMAIN_EVENT_DISPATCHER');
