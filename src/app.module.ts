import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [AppConfigModule, PrismaModule, EventsModule],
  controllers: [HealthController],
})
export class AppModule {}
