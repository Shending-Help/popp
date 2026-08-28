-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('CREATED', 'ONGOING', 'COMPLETED');

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email_address" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "application_id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'CREATED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_application_id_key" ON "conversations"("application_id");

-- CreateIndex
CREATE INDEX "conversations_status_created_at" ON "conversations"("status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_candidate_job_key" ON "conversations"("candidate_id", "job_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- R1: at most one ACTIVE conversation per candidate.
--
-- Prisma cannot express a partial index, so this is hand-authored. It is NOT a
-- convenience index: it is the correctness guarantee for R1. The service-layer
-- pre-check exists to produce a good error message on the common path; THIS is
-- what makes the rule true under concurrent webhook delivery.
--
-- The predicate covers BOTH active states, not just CREATED. That is deliberate:
--   CREATED -> ONGOING   moves the row *within* the predicate, so a legal
--                        transition never fights the constraint.
--   ONGOING -> COMPLETED drops the row *out* of the predicate, which is exactly
--                        what frees the candidate for a future application.
-- The invariant and the state machine therefore agree by construction.
CREATE UNIQUE INDEX "conversations_one_active_per_candidate"
  ON "conversations" ("candidate_id")
  WHERE "status" IN ('CREATED', 'ONGOING');
