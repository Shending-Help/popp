import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { verifySignature } from '../signature';

@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const header = request.header('x-webhook-signature');
    if (!header) throw new UnauthorizedException('Missing x-webhook-signature header');

    // The EXACT bytes received. Re-serialising req.body would change key order
    // and whitespace, and the signature would never match.
    const body = request.rawBody?.toString('utf8') ?? '';

    const ok = verifySignature(
      this.config.getOrThrow<string>('WEBHOOK_SIGNING_SECRET'),
      body,
      header,
      this.config.getOrThrow<number>('WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS'),
    );
    if (!ok) throw new UnauthorizedException('Invalid webhook signature');
    return true;
  }
}
