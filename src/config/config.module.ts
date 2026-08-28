import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { parseEnv } from './env.schema';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: parseEnv })],
  exports: [ConfigModule],
})
export class AppConfigModule {}
