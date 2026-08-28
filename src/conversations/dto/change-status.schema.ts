import { z } from 'zod';
import { CONVERSATION_STATUSES } from '../domain/status';

/**
 * `version` is REQUIRED, not optional.
 *
 * An optional version would silently degrade to last-write-wins for any caller
 * who omitted it — worse than having no optimistic lock at all, because callers
 * would believe they were protected. Requiring it forces a read-before-write,
 * which is what makes the lock meaningful.
 */
export const changeStatusSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES as unknown as [string, ...string[]]),
  version: z.number().int().min(0),
});

export type ChangeStatusBody = z.infer<typeof changeStatusSchema>;
