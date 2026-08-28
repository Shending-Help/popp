import { Global, Module } from '@nestjs/common';
import { DOMAIN_EVENT_DISPATCHER } from './domain-event';
import { LoggingDomainEventDispatcher } from './logging-dispatcher';

@Global()
@Module({
  providers: [{ provide: DOMAIN_EVENT_DISPATCHER, useClass: LoggingDomainEventDispatcher }],
  exports: [DOMAIN_EVENT_DISPATCHER],
})
export class EventsModule {}
