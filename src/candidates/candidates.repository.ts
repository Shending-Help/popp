import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { CandidateContact } from '../conversations/domain/types';

type Db = PrismaClient | Prisma.TransactionClient;

@Injectable()
export class CandidatesRepository {
  /**
   * Hand-written INSERT ... ON CONFLICT rather than prisma.candidate.upsert().
   *
   * Prisma's upsert does not always compile to a single atomic statement, and
   * under concurrent webhook delivery for the same candidate a SELECT-then-INSERT
   * upsert raises a unique violation instead of updating. ON CONFLICT DO UPDATE
   * takes a row lock and is atomic by definition.
   */
  async upsert(db: Db, contact: CandidateContact): Promise<void> {
    await db.$executeRaw`
      INSERT INTO "candidates"
        ("id", "phone_number", "first_name", "last_name", "email_address", "created_at", "updated_at")
      VALUES
        (${contact.candidateId}, ${contact.phoneNumber}, ${contact.firstName},
         ${contact.lastName}, ${contact.emailAddress}, now(), now())
      ON CONFLICT ("id") DO UPDATE SET
        "phone_number"  = EXCLUDED."phone_number",
        "first_name"    = EXCLUDED."first_name",
        "last_name"     = EXCLUDED."last_name",
        "email_address" = EXCLUDED."email_address",
        "updated_at"    = now()
    `;
  }
}
