import { Logger } from '@nestjs/common';
import { LoggingDomainEventDispatcher } from './logging-dispatcher';

describe('LoggingDomainEventDispatcher', () => {
  it('logs the event type and aggregate id', async () => {
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const dispatcher = new LoggingDomainEventDispatcher();

    await dispatcher.dispatch({
      type: 'conversation.created',
      conversationId: 'conv-1', candidateId: 'cand-1', jobId: 'job-1',
      occurredAt: new Date('2026-08-28T12:00:00Z'),
    });

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('conversation.created'),
      expect.stringContaining('conv-1'),
    );
    spy.mockRestore();
  });
});
