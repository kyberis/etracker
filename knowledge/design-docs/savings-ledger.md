# savings-ledger: append-only ledger + denormalized cache

## Problem

La pila de ahorros de Clara empezó como un único `Decimal` (`User.savings`)
incrementado/decrementado en línea desde el flujo de cierre de mes
("dejar aparte el sobrante"). Apenas agregamos un aporte mensual
informativo, derivaciones automáticas y cobertura de deuda, ese único
campo deja de servir: no hay forma de saber **por qué** la pila vale lo
que vale, no hay trazabilidad cronológica, no se puede revertir un
movimiento puntual y cualquier bug que sume mal queda permanentemente
incrustado en el cache.

## Decision

Toda variación de la pila pasa por un único punto de entrada que inserta
un **movimiento firmado** en un ledger (`SavingsMovement`) y, dentro de la
**misma transacción Prisma**, actualiza el cache `User.savings`.

- El ledger es **append-only** para los kinds del sistema
  (`MONTHLY_CONTRIBUTION`, `CARRYOVER_DEPOSIT`, `DEBT_COVERAGE`); solo se
  borran reemplazándolos dentro del mismo flujo (p. ej. al sustituir el
  aporte mensual de un mes por uno nuevo, ambos pasos viven en la misma
  transacción).
- Los manuales (`MANUAL_DEPOSIT`, `MANUAL_WITHDRAWAL`) sí son editables y
  borrables a mano; cada modificación recalcula el cache por delta dentro
  de una transacción.
- `User.savings` es un cache reconstruible: `recomputeSavingsCache(userId)`
  lo regenera de `SUM(amount)`. Útil como red de seguridad y para el
  backfill inicial.

## Why this and not X

- **"Solo el cache" (statu quo)** — perdés trazabilidad, no podés revertir
  un movimiento ni mostrar el "por qué" del balance, y cualquier bug se
  acumula sin forma sencilla de auditar.
- **"Solo el ledger, sin cache"** — cada lectura de balance se vuelve
  `SUM(amount) WHERE userId = ?`. Para la pila lo banca, pero
  `loadMonthPageData` y el header sticky leen `savings` muy seguido; un
  agregado por usuario por request es ruido innecesario.
- **"Ledger inmutable estricto, sin reemplazos"** — obligaría a tener
  movimientos compensatorios para todo (un MANUAL_DEPOSIT + un
  MANUAL_WITHDRAWAL para "editar"). Suma ruido en la UI sin beneficio
  para Clara.
- **"Eventos en cola"** — los flujos son síncronos y ya viven dentro de
  request/response del usuario. Una cola sumaría latencia y complejidad
  sin ganar nada.

## How to follow it

- Toda mutación del ahorro pasa por `src/lib/savings.ts`:
  - `recordSavingsMovement(input, tx?)` — insert + cache++ atómico. Acepta
    un `Prisma.TransactionClient` para encadenar dentro de un flujo más
    grande (p. ej. cobertura de deuda, que también ajusta `MonthRecord`).
  - `deleteSavingsMovement(id, userId)` — borra + cache--.
  - `updateSavingsMovementAmount(id, userId, next, patch?)` — edita por
    delta.
  - `setMonthlySavingsContribution`, `removeMonthlySavingsContribution`,
    `coverMonthDebt` — flujos del mes que envuelven a los anteriores.
  - `recomputeSavingsCache(userId)` — defensa en profundidad / backfill.
- **Nunca** modifiques `User.savings` directamente. Cualquier `db.user.update({
  data: { savings: ... } })` fuera de `src/lib/savings.ts` (excepto
  el backfill inicial) es una violación.
- Los kinds del sistema solo se crean/borran desde el flujo del mes.
  Las API routes de `/api/savings/[id]` filtran por kind y devuelven 409
  si el caller intenta modificar uno del sistema.

## How to enforce it

- Tests unitarios (`src/lib/savings.test.ts`) que verifican el invariante
  `User.savings === SUM(SavingsMovement.amount)` después de cada flujo.
- Review checklist: cualquier cambio que toque `prisma/schema.prisma` o
  `src/lib/savings.ts` requiere revisar también el spec
  `knowledge/product-specs/savings.md`.
- `npm run knowledge:gen` para mantener `knowledge/generated/` en sincro
  con el schema (cuando se agregan modelos relacionados).

## Open questions

- ¿Soportamos múltiples pilas (objetivos de ahorro)? Hoy la pila es una
  sola; agregar `goalId` al ledger sería retrocompatible (default null).
- ¿Conversión multi-moneda histórica? El snapshot por movimiento es
  suficiente para el caso simple, pero si el usuario cambia de moneda
  principal y quiere ver totales convertidos retroactivamente, hay que
  revisar.
- ¿Vale la pena exponer `recomputeSavingsCache` desde el panel de admin?
  Hoy solo lo usa el backfill.
