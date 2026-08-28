import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Missing bearer token');

    const expected = Buffer.from(this.config.getOrThrow<string>('API_TOKEN'), 'utf8');
    const actual = Buffer.from(token, 'utf8');
    // Constant-time comparison: a length-varying compare leaks the token
    // one byte at a time to anyone who can measure response latency.
    const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
    if (!ok) throw new UnauthorizedException('Invalid API token');
    return true;
  }
}
