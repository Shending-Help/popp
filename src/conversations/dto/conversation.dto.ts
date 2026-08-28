import { ApiProperty } from '@nestjs/swagger';
import { ConversationRecord } from '../domain/types';

/**
 * The snake_case serialization boundary. Prisma objects are camelCase; the
 * brief's documented model is snake_case. Mapping here means a Prisma column
 * rename can never silently change the public API.
 */
export class ConversationDto {
  @ApiProperty() id!: string;
  @ApiProperty() candidate_id!: string;
  @ApiProperty() job_id!: string;
  @ApiProperty({ enum: ['CREATED', 'ONGOING', 'COMPLETED'] }) status!: string;
  @ApiProperty() version!: number;
  @ApiProperty() created_at!: string;
  @ApiProperty() updated_at!: string;

  static from(r: ConversationRecord): ConversationDto {
    return {
      id: r.id,
      candidate_id: r.candidateId,
      job_id: r.jobId,
      status: r.status,
      version: r.version,
      created_at: r.createdAt.toISOString(),
      updated_at: r.updatedAt.toISOString(),
    };
  }
}
