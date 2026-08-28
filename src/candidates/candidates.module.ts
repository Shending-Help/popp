import { Module } from '@nestjs/common';
import { CandidatesRepository } from './candidates.repository';

@Module({ providers: [CandidatesRepository], exports: [CandidatesRepository] })
export class CandidatesModule {}
