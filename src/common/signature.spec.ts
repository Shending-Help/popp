import { buildSignatureHeader, parseSignatureHeader, signPayload, verifySignature } from './signature';

const SECRET = 'test-secret-at-least-16';
const BODY = '{"id":"app-1"}';

describe('signature', () => {
  it('produces a stable hex signature for the same inputs', () => {
    expect(signPayload(SECRET, 1000, BODY)).toBe(signPayload(SECRET, 1000, BODY));
  });

  it('changes when the body changes', () => {
    expect(signPayload(SECRET, 1000, BODY)).not.toBe(signPayload(SECRET, 1000, '{"id":"app-2"}'));
  });

  it('changes when the timestamp changes — this is what blocks replay', () => {
    expect(signPayload(SECRET, 1000, BODY)).not.toBe(signPayload(SECRET, 1001, BODY));
  });

  it('round-trips through the header format', () => {
    const header = buildSignatureHeader(SECRET, BODY, 1000);
    expect(parseSignatureHeader(header)).toEqual({ timestamp: 1000, signature: expect.any(String) });
  });

  it('accepts a valid signature inside the tolerance window', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = buildSignatureHeader(SECRET, BODY, now);
    expect(verifySignature(SECRET, BODY, header, 300)).toBe(true);
  });

  it('rejects a signature outside the tolerance window', () => {
    const stale = Math.floor(Date.now() / 1000) - 3600;
    const header = buildSignatureHeader(SECRET, BODY, stale);
    expect(verifySignature(SECRET, BODY, header, 300)).toBe(false);
  });

  it('rejects a tampered body', () => {
    const header = buildSignatureHeader(SECRET, BODY);
    expect(verifySignature(SECRET, '{"id":"tampered"}', header, 300)).toBe(false);
  });

  it('rejects a malformed header instead of throwing', () => {
    expect(verifySignature(SECRET, BODY, 'garbage', 300)).toBe(false);
  });
});
