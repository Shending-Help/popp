import { parsePhoneNumberFromString } from 'libphonenumber-js';

/**
 * ITU E.164: a leading '+', a country code that cannot start with 0, and a
 * total of 7-15 digits. No separators, no letters, no extensions.
 */
const E164 = /^\+[1-9]\d{6,14}$/;

export type PhoneValidation =
  | { ok: true; e164: string; plausible: boolean }
  | { ok: false; reason: 'NOT_E164' | 'NOT_PLAUSIBLE' };

/**
 * Two-tier validation.
 *
 * Tier 1 (always on) is E.164 syntax. Tier 2 is libphonenumber's national-length
 * and prefix metadata (isPossible()), and it is OFF by default because the
 * brief's own example payload (+1234567890) fails it: that number parses as
 * country code +1 with a 9-digit national number, where US numbers require 10.
 *
 * Deliberately isPossible() rather than isValid(): isValid() also rejects
 * numbers in ranges reserved for fiction/testing (e.g. Ofcom's 07700 900xxx
 * block), which legitimately appear as test data in recruitment pipelines.
 * Possibility (correct length and prefix shape) is the right bar here.
 *
 * Rejecting the brief's example would be "more correct" and less useful. The
 * plausibility verdict is still returned so callers can log a warning.
 */
export function validatePhoneNumber(raw: string, opts: { strict: boolean }): PhoneValidation {
  const trimmed = raw.trim();
  if (!E164.test(trimmed)) return { ok: false, reason: 'NOT_E164' };

  const parsed = parsePhoneNumberFromString(trimmed);
  const plausible = parsed?.isPossible() === true;

  if (!plausible && opts.strict) return { ok: false, reason: 'NOT_PLAUSIBLE' };

  // parsed.number is the canonical E.164 form; fall back to the input, which
  // already passed the E.164 gate above.
  return { ok: true, e164: parsed?.number ?? trimmed, plausible };
}
