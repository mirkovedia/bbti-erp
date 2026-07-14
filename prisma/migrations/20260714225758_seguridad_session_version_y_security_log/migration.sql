-- AlterTable
ALTER TABLE "users" ADD COLUMN     "session_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "security_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" TEXT NOT NULL,
    "email" TEXT,
    "ip" TEXT,
    "detalle" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_log_created_at_idx" ON "security_log"("created_at" DESC);
