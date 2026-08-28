import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody is required by the webhook HMAC guard (Task 10): the signature is
  // computed over the exact bytes received, so a re-serialised body will not match.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
