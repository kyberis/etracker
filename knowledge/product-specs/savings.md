# savings

> Pila global de ahorros del usuario respaldada por un ledger inmutable de
> movimientos firmados. Aporte mensual informativo, derivación de sobrantes
> y cobertura de deuda al cierre de mes, con cobertura completa desde REST,
> agente Clara y MCP.

## What it does

- Cada usuario tiene una **pila global** de ahorro (`User.savings`,
  denormalizado en `primaryCurrency`). Toda variación queda registrada en
  un **ledger** (`SavingsMovement`) cuya suma firmada coincide siempre con
  la pila.
- **Aporte mensual informativo**: el usuario puede declarar uno por mes
  (`MONTHLY_CONTRIBUTION`). Suma a la pila pero **no** descuenta del balance
  del mes ni aparece como `MonthExpenseLine`.
- **Sobrante derivado a ahorro**: si el mes anterior cerró con sobrante y
  el usuario elige "dejar aparte", se inserta un `CARRYOVER_DEPOSIT`
  vinculado al mes que originó el sobrante.
- **Cobertura de deuda**: si el mes anterior cerró en rojo, al crear/visitar
  el mes actual se ofrecen dos opciones: cubrir desde la pila
  (`coverFromSavings` → movimiento `DEBT_COVERAGE` negativo, deuda restante
  pasa como `carryoverFromPrev` negativo) o arrastrar la deuda completa
  (`carryDebt`).
- **Movimientos manuales** (`MANUAL_DEPOSIT` / `MANUAL_WITHDRAWAL`)
  permiten registrar entradas/salidas ad-hoc y son los únicos editables /
  borrables a mano (los kinds del sistema son inmutables para preservar la
  trazabilidad del ledger).

## Where the code lives

| Layer | Path |
|-------|------|
| Types / validators | `src/lib/validators.ts` (`carryoverDecisionSchema`, `savingsMovementCreateSchema`, `savingsMovementUpdateSchema`, `monthlySavingsContributionSchema`) |
| DB / Prisma model | `prisma/schema.prisma` (model `SavingsMovement`, enum `SavingsMovementKind`) |
| Service | `src/lib/savings.ts` |
| Carryover orchestration | `src/lib/month-bucket.ts` (`getPrevMonthBalance`, `applyPrevMonthLeftoverDecision`) |
| Page payload | `src/lib/month-page-data.ts`, `src/lib/month-page-types.ts` |
| API routes | `src/app/api/savings/route.ts`, `src/app/api/savings/[id]/route.ts`, `src/app/api/months/[month]/savings-contribution/route.ts`, `src/app/api/months/[month]/carryover/route.ts` |
| Agent tools | `src/lib/ai/expense-tools.ts` (`getSavingsState`, `addSavingsMovement`, `setMonthlySavingsContribution`, `removeMonthlySavingsContribution`, `applyPrevMonthLeftover`) |
| MCP tools | `src/lib/mcp/user-server.ts` (`getSavings`, `addSavingsMovement`, `setMonthlySavingsContribution`) |
| UI | `src/app/(app)/savings/page.tsx`, `src/components/savings-manager.tsx`, `src/components/month-dashboard.tsx` (carryover dialog + savings sub-card) |
| Backfill | `scripts/backfill-savings-ledger.ts` |

## Data model

```prisma
enum SavingsMovementKind {
  MONTHLY_CONTRIBUTION
  CARRYOVER_DEPOSIT
  DEBT_COVERAGE
  MANUAL_DEPOSIT
  MANUAL_WITHDRAWAL
}

model SavingsMovement {
  id            String   @id @default(cuid())
  userId        String
  monthRecordId String?  // contexto (mes que originó el movimiento)
  kind          SavingsMovementKind
  amount        Decimal  // FIRMADO (positivo entra, negativo sale)
  currency      String   // snapshot de User.primaryCurrency
  note          String?
  occurredOn    DateTime @db.Date
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@index([userId, occurredOn])
  @@index([userId, monthRecordId])
  @@unique([userId, monthRecordId, kind], name: "uq_savings_one_per_kind_per_month")
}
```

`User.savings` se mantiene como cache denormalizado dentro de la misma
transacción que inserta o borra cada movimiento (helpers en `src/lib/savings.ts`).
Migración aditiva: `prisma/migrations/20260501100000_savings_ledger/migration.sql`.

## Contracts

### REST

- `GET /api/savings?limit=50` → `{ balance, currency, movements[] }`.
- `POST /api/savings` con `{ kind: "MANUAL_DEPOSIT" | "MANUAL_WITHDRAWAL", amount, note?, occurredOn? }` → 201 con el movimiento creado y `balance` resultante. Para `MANUAL_WITHDRAWAL` valida que la pila alcance (409 si no).
- `PATCH /api/savings/[id]` con `{ amount?, note?, occurredOn? }` — solo MANUAL_*. Devuelve 409 para kinds del sistema.
- `DELETE /api/savings/[id]` — solo MANUAL_*. Revierte el efecto sobre la pila.
- `POST /api/months/[month]/savings-contribution` con `{ amount, note? }` → upsert del aporte mensual (201 con `replaced: boolean`).
- `DELETE /api/months/[month]/savings-contribution` → borra el aporte mensual y revierte el efecto.
- `POST /api/months/[month]/carryover` con `{ mode: "addToIncome" | "setAside" | "coverFromSavings" | "carryDebt" }`. Devuelve `{ applied, leftover, mode, covered, remainingDebt, data }`. 400 cuando el `mode` no concuerda con el signo del sobrante.

### Agent tools

- `getSavingsState({ limit? })` — read.
- `addSavingsMovement({ kind, amount, note?, occurredOn? })` — manual.
- `setMonthlySavingsContribution({ month, amount, note? })` — upsert.
- `removeMonthlySavingsContribution({ month })`.
- `applyPrevMonthLeftover({ month?, mode })` — soporta los 4 modes (`addToIncome`, `setAside`, `coverFromSavings`, `carryDebt`).

### MCP (per-user)

- `getSavings({ limit? })`.
- `addSavingsMovement({ kind: "MANUAL_DEPOSIT" | "MANUAL_WITHDRAWAL", amount, note?, occurredOn? })`.
- `setMonthlySavingsContribution({ month, amount, note? })`.

## Invariants

- `User.savings === SUM(SavingsMovement.amount)` para cada usuario, en todo
  momento. Toda mutación va por `recordSavingsMovement` /
  `deleteSavingsMovement` / `updateSavingsMovementAmount` o por el flujo
  específico del mes (`coverMonthDebt`, `setMonthlySavingsContribution`),
  que actualizan ledger y cache en la misma transacción.
- A lo sumo **un** `MONTHLY_CONTRIBUTION` y **un** `CARRYOVER_DEPOSIT` por
  `(userId, monthRecordId)` (índice único). Reemplazos = borrar + crear
  dentro de la misma transacción.
- Movimientos de tipo `CARRYOVER_DEPOSIT`, `MONTHLY_CONTRIBUTION` y
  `DEBT_COVERAGE` son inmutables vía API a mano: solo el flujo del mes
  los crea/borra. PATCH/DELETE retornan 409 para esos kinds.
- El aporte mensual NO afecta el balance del mes (`income + carryover -
  planned`). Es puramente declarativo.
- El campo `currency` en cada movimiento es un snapshot: si el usuario
  cambia su `primaryCurrency`, los movimientos viejos no se reconvierten.

## Known gaps / TODOs

- Sin conversión multi-moneda para la pila: si el usuario cambia
  `primaryCurrency`, sumamos numéricos heterogéneos. En la práctica son
  solo los movimientos pre-cambio; los nuevos vienen en la nueva moneda.
- No se exponen movimientos del sistema con notas editables (DEBT_COVERAGE
  no permite agregar contexto a mano).
- Falta paginación real en `GET /api/savings` (hoy solo `limit` y orden
  desc por `occurredOn`).
- El backfill (`scripts/backfill-savings-ledger.ts`) corre una sola vez por
  deploy y deja una nota fija en español.

## Related

- Design doc: `knowledge/design-docs/savings-ledger.md`
- Carryover (positivo): heredado del flujo previo en `month-bucket.ts`.
- Skill: ninguno dedicado todavía; se cubre desde
  `engineer-data` y `automated-user-comms`.
