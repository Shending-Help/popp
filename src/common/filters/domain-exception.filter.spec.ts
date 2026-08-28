import { ArgumentsHost } from '@nestjs/common';
import { DomainExceptionFilter } from './domain-exception.filter';
import {
  ConcurrentModificationError, ConversationNotFoundError,
  IllegalTransitionError, InvalidPhoneNumberError,
} from '../errors/domain-errors';

function hostWith(): { host: ArgumentsHost; status: jest.Mock; json: jest.Mock } {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('DomainExceptionFilter', () => {
  const filter = new DomainExceptionFilter();

  it.each([
    [new IllegalTransitionError('COMPLETED', 'ONGOING'), 422, 'ILLEGAL_TRANSITION'],
    [new ConcurrentModificationError('abc'), 409, 'CONCURRENT_MODIFICATION'],
    [new ConversationNotFoundError('abc'), 404, 'CONVERSATION_NOT_FOUND'],
    [new InvalidPhoneNumberError('NOT_E164'), 400, 'INVALID_PHONE_NUMBER'],
  ])('maps %s correctly', (error, expectedStatus, expectedCode) => {
    const { host, status, json } = hostWith();
    filter.catch(error, host);
    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expectedCode, message: error.message }),
    );
  });
});
