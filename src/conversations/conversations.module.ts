import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates/candidates.module';
import { ConversationsRepository } from './conversations.repository';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [CandidatesModule],
  providers: [ConversationsRepository, ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
