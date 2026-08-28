import { z } from 'zod';
import { CONVERSATION_STATUSES } from '../domain/status';

export const listConversationsSchema = z.object({
  status: z.enum(CONVERSATION_STATUSES as unknown as [string, ...string[]]).optional(),
  candidate_id: z.string().min(1).optional(),
  job_id: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
});

export type ListConversationsQuery = z.infer<typeof listConversationsSchema>;
