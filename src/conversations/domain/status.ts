export type ConversationStatus = 'CREATED' | 'ONGOING' | 'COMPLETED';

export const CONVERSATION_STATUSES: readonly ConversationStatus[] = [
  'CREATED', 'ONGOING', 'COMPLETED',
] as const;

/**
 * The legal transition graph, declared as data rather than as branching logic.
 *
 * Deliberately strictly linear. CREATED -> COMPLETED is EXCLUDED: a production
 * system almost certainly needs it (job filled, candidate withdrew, hard bounce
 * on the phone number), but the brief describes a linear flow and inventing
 * states is not our call to make. To add it, add 'COMPLETED' to the CREATED
 * row here — no other code changes are required, which is the point of
 * expressing this as a table.
 */
export const TRANSITIONS: Record<ConversationStatus, readonly ConversationStatus[]> = {
  CREATED: ['ONGOING'],
  ONGOING: ['COMPLETED'],
  COMPLETED: [],
} as const;

export function isConversationStatus(value: unknown): value is ConversationStatus {
  return typeof value === 'string'
    && (CONVERSATION_STATUSES as readonly string[]).includes(value);
}
