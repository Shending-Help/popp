/**
 * Signs and posts a webhook payload. A signed request cannot be hand-curled,
 * so this is the thirty-second demo path:
 *   npm run webhook:send -- examples/application.json
 */
import { readFileSync } from 'node:fs';
import { buildSignatureHeader } from '../src/common/signature';

async function main() {
  const file = process.argv[2] ?? 'examples/application.json';
  const url = process.env.WEBHOOK_URL ?? 'http://localhost:3000/webhooks/applications';
  const secret = process.env.WEBHOOK_SIGNING_SECRET;
  if (!secret) throw new Error('WEBHOOK_SIGNING_SECRET is not set — did you copy .env.example?');

  const body = readFileSync(file, 'utf8');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-webhook-signature': buildSignatureHeader(secret, body),
    },
    body,
  });

  console.log(`${response.status} ${response.statusText}`);
  console.log(JSON.stringify(await response.json(), null, 2));
}

void main();
