-- Carryover sobrante del mes anterior + ahorros del usuario.
-- - User.savings: pila acumulada (primary currency) cuando el usuario elige
--   "dejar aparte" en lugar de sumar el sobrante al ingreso del mes siguiente.
-- - MonthRecord.carryoverFromPrev: monto que se sumó al mes desde el sobrante
--   del mes anterior. Mantenerlo en columna aparte permite mostrar el desglose
--   en la UI ("Ingreso $X + carryover $Y") y no se pierde si el usuario edita
--   `income` después.
-- - MonthRecord.carryoverDecidedAt: marca temporal de la decisión. Null =
--   todavía no se preguntó/decidió, así que la UI y el agente deben mostrar
--   el prompt.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "savings" DECIMAL(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE "MonthRecord"
  ADD COLUMN IF NOT EXISTS "carryoverFromPrev" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "carryoverDecidedAt" TIMESTAMP(3);
