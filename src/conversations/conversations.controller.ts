import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiTokenGuard } from '../common/guards/api-token.guard';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { ConversationsService } from './conversations.service';
import { ConversationDto } from './dto/conversation.dto';
import { ConversationStatus } from './domain/status';
import { ListConversationsQuery, listConversationsSchema } from './dto/list-conversations.schema';

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
}
