import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent, DomainEventDispatcher } from './domain-event';

@Injectable()
export class LoggingDomainEventDispatcher implements DomainEventDispatcher {
  private readonly logger = new Logger(LoggingDomainEventDispatcher.name);

  async dispatch(event: DomainEvent): Promise<void> {
    this.logger.log(`domain event: ${event.type}`, JSON.stringify(event));
  }
}
