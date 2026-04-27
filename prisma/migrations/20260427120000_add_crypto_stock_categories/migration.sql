-- AlterEnum (idempotent: labels may already exist on drifted DBs)
DO $$ BEGIN
  ALTER TYPE "ExpenseCategory" ADD VALUE 'CRYPTO';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "ExpenseCategory" ADD VALUE 'STOCK';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
