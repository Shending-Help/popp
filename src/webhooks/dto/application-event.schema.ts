import { z } from 'zod';

/**
 * Unknown fields are STRIPPED, not rejected. Webhook senders add fields over
 * time and a receiver that 400s on an unrecognised key is a receiver that
 * breaks on someone else's Tuesday deploy. (This is zod's default behaviour;
 * stated explicitly because it is a decision, not an accident.)
 */
export const applicationEventSchema = z.object({
  id: z.string().min(1),
  job_id: z.string().min(1),
  candidate_id: z.string().min(1),
  candidate: z.object({
    phone_number: z.string().min(1),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    email_address: z.string().email(),
  }),
});

export type ApplicationEventPayload = z.infer<typeof applicationEventSchema>;
