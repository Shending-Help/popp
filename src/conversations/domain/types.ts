import { ConversationStatus } from './status';

export interface ConversationRecord {
  id: string;
  applicationId: string;
  candidateId: string;
  jobId: string;
  status: ConversationStatus;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateContact {
  candidateId: string;
  phoneNumber: string;   // normalized E.164
  firstName: string;
  lastName: string;
  emailAddress: string;
}

export type SkipReason = 'ACTIVE_CONVERSATION_EXISTS' | 'DUPLICATE_APPLICATION';

export type CreateConversationResult =
  | { outcome: 'CREATED'; conversation: ConversationRecord }
  | { outcome: 'REPLAYED'; conversation: ConversationRecord }
  | { outcome: 'SKIPPED'; reason: SkipReason; conversationId: string };
