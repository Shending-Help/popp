import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';

async function bootstrap() {
  // rawBody is required by the webhook HMAC guard (Task 10): the signature is
  // computed over the exact bytes received, so a re-serialised body will not match.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalFilters(new DomainExceptionFilter());
  const swagger = new DocumentBuilder()
    .setTitle('Conversation Integration System')
    .setDescription(
      'Job-application webhook ingestion and conversation lifecycle API. ' +
      'Use the bearer token for internal conversation routes and HMAC signatures for webhooks.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  const config = app.get(ConfigService);
  await app.listen(config.getOrThrow<number>('PORT'));
}
void bootstrap();
