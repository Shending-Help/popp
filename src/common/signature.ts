import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Stripe/GitHub-style webhook signatures.
 *
 * The signature covers `${timestamp}.${body}`, not just the body, so a captured
 * request cannot be replayed indefinitely — the timestamp is authenticated, and
 * the guard rejects anything outside the tolerance window.
 */
export function signPayload(secret: string, timestamp: number, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function buildSignatureHeader(secret: string, body: string, now?: number): string {
  const timestamp = now ?? Math.floor(Date.now() / 1000);
  return `t=${timestamp},v1=${signPayload(secret, timestamp, body)}`;
}

export function parseSignatureHeader(
  header: string,
): { timestamp: number; signature: string } | null {
  const parts = Object.fromEntries(
    header.split(',').map((p) => p.split('=', 2) as [string, string]),
  );
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || typeof parts.v1 !== 'string') return null;
  return { timestamp, signature: parts.v1 };
}

export function verifySignature(
  secret: string,
  body: string,
  header: string,
  toleranceSeconds: number,
): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - parsed.timestamp);
  if (age > toleranceSeconds) return false;

  const expected = Buffer.from(signPayload(secret, parsed.timestamp, body), 'utf8');
  const actual = Buffer.from(parsed.signature, 'utf8');
  // Length check first: timingSafeEqual throws on a length mismatch.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
