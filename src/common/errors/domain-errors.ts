export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class IllegalTransitionError extends DomainError {
  readonly code = 'ILLEGAL_TRANSITION';
  constructor(readonly from: string, readonly to: string) {
    super(`Illegal status transition: ${from} -> ${to}`);
  }
}

export class ConcurrentModificationError extends DomainError {
  readonly code = 'CONCURRENT_MODIFICATION';
  constructor(readonly conversationId: string) {
    super(`Conversation ${conversationId} was modified concurrently; re-read and retry`);
  }
}

export class ConversationNotFoundError extends DomainError {
  readonly code = 'CONVERSATION_NOT_FOUND';
  constructor(readonly conversationId: string) {
    super(`Conversation ${conversationId} not found`);
  }
}

export class InvalidPhoneNumberError extends DomainError {
  readonly code = 'INVALID_PHONE_NUMBER';
  constructor(reason: string) {
    super(`Invalid phone number: ${reason}`);
  }
}

/**
 * Raised when the database rejects an insert on one of the uniqueness indexes.
 * Carries WHICH rule was violated so the service can choose the right outcome
 * without re-querying.
 */
export class ConversationConflictError extends DomainError {
  readonly code = 'CONVERSATION_CONFLICT';
  constructor(
    readonly constraint: 'APPLICATION' | 'CANDIDATE_JOB' | 'ACTIVE_CANDIDATE',
  ) {
    super(`Conversation conflicts with existing data (${constraint})`);
  }
}
