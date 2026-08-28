import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from '../errors/domain-errors';

/**
 * The 422/409 split is deliberate and they are NOT interchangeable:
 *   409 CONCURRENT_MODIFICATION -> "re-read and try again", retrying can succeed
 *   422 ILLEGAL_TRANSITION      -> "never try this again", retrying cannot help
 * Same rule that decides the webhook's 200-vs-409 contract: will retrying help?
 */
const STATUS_BY_CODE: Record<string, number> = {
  ILLEGAL_TRANSITION: 422,
  CONCURRENT_MODIFICATION: 409,
  CONVERSATION_NOT_FOUND: 404,
  INVALID_PHONE_NUMBER: 400,
  CONVERSATION_CONFLICT: 409,
};

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status = STATUS_BY_CODE[exception.code] ?? 500;
    response.status(status).json({ error: exception.code, message: exception.message });
  }
}
