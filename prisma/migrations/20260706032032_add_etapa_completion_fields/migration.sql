-- AlterTable
ALTER TABLE "proyecto_etapas" ADD COLUMN     "completado_at" TIMESTAMPTZ(6),
ADD COLUMN     "completado_por" TEXT;
