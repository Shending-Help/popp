import {
  Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ConversationsService } from './conversations.service';
import { ConversationDto } from './dto/conversation.dto';
import { ConversationStatus } from './domain/status';
import { ListConversationsQuery, listConversationsSchema } from './dto/list-conversations.schema';
import { ChangeStatusBody, changeStatusSchema } from './dto/change-status.schema';

@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
@UseGuards(ApiTokenGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @ApiOkResponse({ type: ConversationDto, isArray: true })
  async list(
    @Query(new ZodValidationPipe(listConversationsSchema)) query: ListConversationsQuery,
  ) {
    const { items, nextCursor } = await this.conversations.list({
      status: query.status as ConversationStatus | undefined,
      candidateId: query.candidate_id,
      jobId: query.job_id,
      limit: query.limit,
      cursor: query.cursor,
    });

    return {
      data: items.map(ConversationDto.from),
      meta: { count: items.length, next_cursor: nextCursor },
    };
  }

  @Get(':id')
  @ApiOkResponse({ type: ConversationDto })
  async getOne(@Param('id', ParseUUIDPipe) id: string) {
    return ConversationDto.from(await this.conversations.getById(id));
  }

  @Patch(':id/status')
  @ApiOkResponse({ type: ConversationDto })
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: ChangeStatusBody,
  ) {
    const updated = await this.conversations.changeStatus(
      id, body.status as ConversationStatus, body.version,
    );
    return ConversationDto.from(updated);
  }
}
