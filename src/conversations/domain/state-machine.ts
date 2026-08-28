import { IllegalTransitionError } from '../../common/errors/domain-errors';
import { ConversationStatus, TRANSITIONS } from './status';

export type TransitionOutcome = 'APPLY' | 'NOOP';

/**
 * The ONLY sanctioned way a conversation's status changes. No repository method
 * exposes a bare status setter, so this is structural rather than conventional.
 *
 * Returns 'NOOP' for a same-state transition instead of throwing, because the
 * callers are retrying workers and a redelivered transition is correct
 * behaviour, not an error. Same retry-safety concern as R3, on the write path.
 */
export function assertTransition(
  from: ConversationStatus,
  to: ConversationStatus,
): TransitionOutcome {
  if (from === to) return 'NOOP';
  if (TRANSITIONS[from].includes(to)) return 'APPLY';
  throw new IllegalTransitionError(from, to);
}
