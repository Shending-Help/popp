import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { ConversationsModule } from './conversations/conversations.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [AppConfigModule, PrismaModule, EventsModule, ConversationsModule, WebhooksModule],
  controllers: [HealthController],
})
export class AppModule {}
