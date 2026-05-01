/**
 * Backfill: por cada usuario con `User.savings > 0` que NO tenga ningún
 * `SavingsMovement` registrado, inserta un MANUAL_DEPOSIT por el monto
 * actual de la pila. Así el ledger pasa a ser la fuente de verdad y
 * `User.savings === SUM(SavingsMovement.amount)` invariante queda
 * cumplido a partir del deploy.
 *
 * Idempotente: usuarios que ya tienen movimientos no se tocan.
 *
 * Uso (desde external/etracker):
 *   pnpm tsx scripts/backfill-savings-ledger.ts [--dry-run]
 *   npx tsx scripts/backfill-savings-ledger.ts [--dry-run]
 */

import { PrismaClient, SavingsMovementKind } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const note = "Backfill inicial: balance preexistente migrado al ledger.";

  const users = await db.user.findMany({
    where: { savings: { gt: 0 } },
    select: { id: true, email: true, savings: true, primaryCurrency: true },
  });

  if (users.length === 0) {
    console.log("[backfill-savings] No hay usuarios con pila de ahorros > 0. Nada que hacer.");
    return;
  }

  let touched = 0;
  let skipped = 0;
  for (const user of users) {
    const existing = await db.savingsMovement.count({
      where: { userId: user.id },
    });
    if (existing > 0) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      console.log(
        `[dry-run] would seed user=${user.email} amount=${user.savings.toString()} ${user.primaryCurrency}`,
      );
      touched += 1;
      continue;
    }
    await db.savingsMovement.create({
      data: {
        userId: user.id,
        kind: SavingsMovementKind.MANUAL_DEPOSIT,
        amount: user.savings,
        currency: user.primaryCurrency,
        note,
        occurredOn: new Date(
          Date.UTC(
            new Date().getUTCFullYear(),
            new Date().getUTCMonth(),
            new Date().getUTCDate(),
          ),
        ),
      },
    });
    touched += 1;
    console.log(
      `[backfill-savings] seeded user=${user.email} amount=${user.savings.toString()} ${user.primaryCurrency}`,
    );
  }

  console.log(
    `[backfill-savings] done. seeded=${touched} skipped(existing-ledger)=${skipped} total-candidates=${users.length}`,
  );
}

main()
  .catch((error) => {
    console.error("[backfill-savings] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
