import { Body, Controller, HttpCode, Post, Res, UseGuards, UsePipes } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { WebhookSignatureGuard } from '../common/guards/webhook-signature.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationDto } from '../conversations/dto/conversation.dto';
import { ApplicationEventPayload, applicationEventSchema } from './dto/application-event.schema';

@Controller('webhooks')
@ApiTags('webhooks')
@UseGuards(WebhookSignatureGuard)
export class WebhooksController {
  constructor(private readonly conversations: ConversationsService) {}

  /**
   * The contract splits on "did I process this?", NOT "did I create a row?".
   *
   * Every mainstream webhook dispatcher treats non-2xx as "you failed, I will
   * retry". A business-rule rejection is not a failure — the event was received,
   * evaluated correctly, and correctly produced no conversation. Retrying can
   * never change that, so returning 409 here would buy a retry storm and an
   * eventual dead-letter alert for a system working exactly as designed.
   *
   * 201 = created. 200 = processed, no new conversation, with a machine-readable
   * reason. 400 = sender bug. 500 = genuinely transient, please DO retry.
   */
  @Post('applications')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ingest a signed job application webhook' })
  @UsePipes(new ZodValidationPipe(applicationEventSchema))
  async handleApplication(
    @Body() payload: ApplicationEventPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.conversations.createFromApplication({
      applicationId: payload.id,
      candidateId: payload.candidate_id,
      jobId: payload.job_id,
      candidate: {
        phoneNumber: payload.candidate.phone_number,
        firstName: payload.candidate.first_name,
        lastName: payload.candidate.last_name,
        emailAddress: payload.candidate.email_address,
      },
    });

    switch (result.outcome) {
      case 'CREATED':
        res.status(201);
        return { outcome: 'CREATED', conversation: ConversationDto.from(result.conversation) };
      case 'REPLAYED':
        return { outcome: 'REPLAYED', conversation: ConversationDto.from(result.conversation) };
      case 'SKIPPED':
        return {
          outcome: 'SKIPPED',
          reason: result.reason,
          conversation_id: result.conversationId,
        };
    }
  }
}
