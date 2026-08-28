import { validatePhoneNumber } from './phone';

describe('validatePhoneNumber — E.164 hard gate', () => {
  const rejected: [string, string][] = [
    ['no leading plus', '447700900000'],
    ['contains letters', '+44770O900000'],
    ['contains separators', '+44 7700 900-000'],
    ['too short', '+4477'],
    ['too long', '+4477009000001234'],
    ['country code starts with zero', '+0447700900000'],
    ['empty', ''],
  ];

  it.each(rejected)('rejects %s', (_label, input) => {
    expect(validatePhoneNumber(input, { strict: false }))
      .toEqual({ ok: false, reason: 'NOT_E164' });
  });

  it('accepts and returns a valid UK number in E.164', () => {
    expect(validatePhoneNumber('+447700900123', { strict: false }))
      .toEqual({ ok: true, e164: '+447700900123', plausible: true });
  });
});

describe('validatePhoneNumber — plausibility tier', () => {
  // The brief's own example payload. It parses as country code +1 with a
  // 9-digit national number, where US numbers require 10 — so it is
  // syntactically valid E.164 but not a real number. Strict mode must be OFF
  // by default so the brief's example is accepted.
  const BRIEF_EXAMPLE = '+1234567890';

  it('accepts the brief example when strict mode is off, flagged implausible', () => {
    expect(validatePhoneNumber(BRIEF_EXAMPLE, { strict: false }))
      .toEqual({ ok: true, e164: BRIEF_EXAMPLE, plausible: false });
  });

  it('rejects the brief example when strict mode is on', () => {
    expect(validatePhoneNumber(BRIEF_EXAMPLE, { strict: true }))
      .toEqual({ ok: false, reason: 'NOT_PLAUSIBLE' });
  });

  it('accepts a genuinely valid number under strict mode', () => {
    expect(validatePhoneNumber('+447700900123', { strict: true }))
      .toEqual({ ok: true, e164: '+447700900123', plausible: true });
  });

  // +447700900123 is in Ofcom's reserved fiction range (07700 900xxx):
  // libphonenumber reports it possible (correct length and prefix shape) but
  // not valid (the range is not assigned to real subscribers). The plausibility
  // tier deliberately checks possibility, not validity — reserved ranges are
  // legitimate test data in recruitment pipelines.
  it('accepts a reserved-fiction-range number, documenting possibility vs validity', () => {
    expect(validatePhoneNumber('+447700900123', { strict: true }))
      .toEqual({ ok: true, e164: '+447700900123', plausible: true });
  });
});
