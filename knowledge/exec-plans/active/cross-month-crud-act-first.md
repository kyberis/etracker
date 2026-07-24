---
name: cross-month-crud-act-first
overview: >
  Clara puede crear, editar y borrar gastos e ingresos de cualquier mes (Telegram,
  chat web y dashboard) con paridad REST ↔ agente ↔ MCP. Fechas sin fuente explícita
  se asumen como hoy y se marcan como estimadas; CSV/PDF conservan la fecha del
  artefacto. El agente actúa con menos preguntas cuando la intención es clara.
  Las líneas viven en el MonthRecord del mes de occurredOn (rebucket al editar).
todos:
  - id: design-bucketing
    status: completed
    content: >
      Design doc `knowledge/design-docs/occurred-on-month-bucketing.md` — occurredOn
      es la fuente de verdad del bucket; reglas de rebucket, futuro, dedupe e
      eventos BY_DATE vs LUMP_SUM.
  - id: schema-date-source
    status: completed
    content: >
      Prisma enum `OccurrenceDateSource` (USER | ARTIFACT | ESTIMATED) +
      `occurredOnSource` en `MonthExpenseLine` y `MonthIncomeLine`. Migración +
      backfill ESTIMATED donde occurredOn = createdAt::date en líneas manuales sin
      fecha explícita (best-effort, nullable default USER).
  - id: lib-rebucket
    status: completed
    content: >
      `src/lib/month-line-bucket.ts` — `resolveMonthRecordId(userId, occurredOn)`,
      `rebucketLineIfNeeded(lineId, newOccurredOn)`, usado por REST y tools.
      Tests en `month-line-bucket.test.ts`.
  - id: api-expense-crud
    status: completed
    content: >
      Quitar guard `isCurrentMonthKey` en POST
      `src/app/api/months/[month]/lines/route.ts` y POST incomes; extender
      `monthExpenseLineUpdateSchema` + PATCH
      `src/app/api/month-expense-lines/[id]/route.ts` (occurredOn, bankId,
      category + rebucket); agregar DELETE en la misma ruta.
  - id: api-income-crud
    status: completed
    content: >
      Quitar guard en POST `src/app/api/months/[month]/incomes/route.ts`; PATCH
      income rebucketa si cambia occurredOn; verificar DELETE ya expuesto.
  - id: agent-tools
    status: completed
    content: >
      `addMonthLine` / `addIncomeLine` — param `month` opcional (yyyy-MM); si
      falta, derivar de occurredOn; set `occurredOnSource`; rebucket en
      `updateMonthLine` / `updateIncomeLine`. Actualizar descriptions + tests
      `expense-tools.test.ts`.
  - id: agent-prompt-act-first
    status: completed
    content: >
      Reescribir bloques en `src/lib/ai/run-expense-agent.ts` — política
      act-first, fecha estimada (chat vs import), mes arbitrario, futuros
      planificados (paid/received false). Mantener confirmación solo en imports
      masivos ambiguos y borrados cuando hay riesgo de equivocación.
  - id: web-line-editor
    status: completed
    content: >
      `MonthLineEditDialog` + `MonthIncomeEditDialog`; menú en
      `month-lines-chronological.tsx` (editar / borrar); badge "fecha estimada";
      habilitar CRUD en todos los meses (`editable` sin depender de
      isCurrentMonth); FAB alta en mes visible (no solo actual).
  - id: mcp-parity
    status: cancelled
    content: >
      Verificar `src/lib/mcp/user-server.ts` refleja nuevos campos
      (occurredOnSource en reads); README + spec mcp-per-user actualizados
      (nombres de tools actuales).
  - id: specs-changelog
    status: completed
    content: >
      Actualizar specs ai-agent, months-and-templates, income, import-pdf-image;
      entrada CHANGELOG ES+EN en marketing-content.ts (minor bump).
  - id: legal-pass
    status: completed
    content: >
      Invocar legal-advisor — nuevo campo persisted, cambios de prompt AI,
      copy UI "fecha estimada".
  - id: qa
    status: in_progress
    content: >
      Checklist manual Telegram + web + mes pasado/futuro; `npm run lint &&
      npx tsc --noEmit && npm test && npm run build` antes de push a main.
---

# cross-month-crud-act-first

Plan de ejecución para que Clara cumpla:

1. **CRUD completo en cualquier mes** (Telegram, chat web, dashboard, MCP).
2. **Fecha estimada** cuando el usuario no da fecha (chat/voz); fecha del artefacto en CSV/PDF.
3. **Ingresos/gastos futuros planificados** (`paid=false` / `received=false`).
4. **Actuar más, preguntar menos** cuando la intención es inequívoca.
5. **Paridad web ↔ agente** (mismos campos editables, mismo modelo de bucket).

Repo: **`kyberis/etracker`** (`external/etracker` en trefolio). No tocar el pin
de trefolio hasta que el plan esté en `completed/` y desplegado.

---

## Decisiones de diseño (fijar en Fase 0)

### Bucket = mes de `occurredOn`

Hoy una línea se crea en el `MonthRecord` del **mes en curso (UTC)** aunque
`occurredOn` sea otro mes. Eso rompe "editar marzo" y "previsto para junio".

**Decisión:** al crear o cambiar `occurredOn`, la línea debe pertenecer al
`MonthRecord` cuyo `month` coincide con el primer día UTC del mes de
`occurredOn`. Si el mes no existe, `createMonthIfNeeded` lo crea (lazy).

| Acción | Comportamiento |
|--------|----------------|
| Alta con `occurredOn = 2026-03-15` | Línea en `MonthRecord` 2026-03-01 |
| Usuario edita fecha de marzo → abril | `monthRecordId` cambia; dedupe revalida |
| Vista `/m/2026-03` | Solo líneas cuyo bucket es marzo (no las mal ubicadas legacy) |

**Migración legacy (Fase 0b, opcional en mismo release):** script one-shot
`scripts/rebucket-lines-by-occurred-on.ts` que mueve líneas donde
`monthRecord.month` ≠ mes de `occurredOn`. Ejecutar en staging antes de prod.

### Origen de fecha (`occurredOnSource`)

| Valor | Cuándo |
|-------|--------|
| `USER` | Usuario escribió/dijo la fecha explícitamente |
| `ARTIFACT` | Fecha leída de CSV, PDF o captura |
| `ESTIMATED` | Chat/voz sin fecha → default `todayUtcDate()` |

Mostrar badge **"fecha estimada"** / **"estimated date"** en UI cuando
`occurredOnSource === ESTIMATED`. El agente puede corregir después con
`updateMonthLine` + `occurredOnSource: USER`.

### Futuros planificados

- Gasto futuro: `occurredOn` futuro + **`paid=false`** (default en chat solo si el usuario dice "va a", "el día X pago", etc.).
- Ingreso futuro: `occurredOn` futuro + **`received=false`** (ya existe badge "previsto").
- El bucket sigue siendo el mes de `occurredOn`, no el mes calendario de hoy.

### Política "act-first" (agente)

| Situación | Antes | Después |
|-----------|-------|---------|
| "Pagué alquiler 850" | OK directo | OK directo + `ESTIMATED` si no hay fecha |
| "Borrá el café de ayer" | Pide confirmación | Ejecuta si `getMonthState` encuentra match único; confirma en una línea |
| "Cargá todo" + CSV | Lista + pregunta | Aplica batch; reporta resumen |
| Import 20 filas ambiguas | Pregunta por fila | Una lista + una confirmación |
| Borrar con 2+ candidatos | — | Pregunta cuál (una pregunta) |
| Moneda no confirmada | Bloquea tools | Sugiere una vez; si contexto ARS-only, infiere y sigue |

Regla dura que **no** se relaja: imports desde artefacto **nunca** defaultean a
hoy sin `ESTIMATED` explícito del usuario.

---

## Fases de ejecución

### Fase 0 — Diseño + schema (bloqueante)

**Entregables**

1. `knowledge/design-docs/occurred-on-month-bucketing.md` (+ entrada en
   `knowledge/design-docs/index.md`).
2. Migración Prisma + `npm run prisma:migrate`.
3. `src/lib/month-line-bucket.ts` + tests.

**Criterios de aceptación**

- [ ] Crear línea con `occurredOn` en mes M la asocia a `MonthRecord(M)`.
- [ ] Cambiar `occurredOn` a otro mes mueve la línea (misma transacción, invalida timeline).
- [ ] Tests verdes para rebucket + dedupe conflict.

**Archivos clave**

- `prisma/schema.prisma` — `MonthExpenseLine`, `MonthIncomeLine`
- `src/lib/month-bucket.ts` — reutilizar `createMonthIfNeeded` existente
- `src/lib/expense-line.ts` — `parseIsoDate`, `todayUtcDate`

---

### Fase 1 — Capa REST (paridad con tools)

**Entregables**

1. POST lines/incomes: validar que `month` del path coincida con mes de
   `occurredOn` (o ignorar path y usar occurredOn — documentar una sola regla).
2. PATCH expense: `occurredOn`, `bankId`, `category` + rebucket.
3. DELETE expense: `DELETE /api/month-expense-lines/[id]`.
4. `monthExpenseLineUpdateSchema` alineado con agente.

**Criterios de aceptación**

- [ ] `POST /api/months/2026-01/lines` funciona (mes pasado).
- [ ] `POST /api/months/2026-08/lines` funciona (mes futuro) con `paid=false`.
- [ ] PATCH cambia banco/categoría/fecha en línea de enero desde UI o curl.
- [ ] DELETE elimina línea de cualquier mes.

**Archivos**

- `src/app/api/months/[month]/lines/route.ts`
- `src/app/api/months/[month]/incomes/route.ts`
- `src/app/api/month-expense-lines/[id]/route.ts` (PATCH + DELETE)
- `src/app/api/months/[month]/incomes/[id]/route.ts`
- `src/lib/validators.ts`

---

### Fase 2 — Tools del agente + MCP

**Entregables**

1. `addMonthLine` / `addIncomeLine`: input `month?: yyyy-MM`; bucket por
   `occurredOn`; output incluye `occurredOnSource`.
2. Updates rebucketan; creates setean source.
3. MCP user-server: mismos contratos (delegar a funciones compartidas, no duplicar lógica).

**Criterios de aceptación**

- [ ] Telegram: "corregí el sueldo de febrero" → `getMonthState("2026-02")` + `updateIncomeLine`.
- [ ] "El 10 de junio me pagan 500" → línea en bucket junio, `received=false`.
- [ ] Tests en `expense-tools.test.ts` para mes pasado/futuro y ESTIMATED.

**Archivos**

- `src/lib/ai/expense-tools.ts`
- `src/lib/ai/expense-tools.test.ts`
- `src/lib/mcp/user-server.ts`

---

### Fase 3 — Prompt act-first

**Entregables**

1. Bloques ES/EN en `run-expense-agent.ts`:
   - Cross-month CRUD (siempre resolver mes explícito o por occurredOn).
   - Fecha estimada vs artefacto.
   - Futuros planificados.
   - Matriz act-first (tabla arriba).
2. Ajustar `import-preferences-message.ts` si hace falta delimitar reglas de import.

**Criterios de aceptación**

- [ ] Prompt tests manuales: 5 escenarios en `knowledge/exec-plans/active/cross-month-crud-act-first-qa.md` (crear al abrir QA).
- [ ] Import CSV sigue exigiendo fecha del archivo; chat sin fecha → ESTIMATED.

**Archivos**

- `src/lib/ai/run-expense-agent.ts`
- `src/lib/ai/import-preferences-message.ts` (si aplica)

---

### Fase 4 — UI web (paridad con chat)

**Entregables**

1. **`MonthExpenseLineEditDialog`** — name, amount, currency, fxRate, bank,
   category, occurredOn, paid; DELETE con confirmación nativa del dialog.
2. **`MonthIncomeLineEditDialog`** — espejo con `received`.
3. Integrar en `month-lines-chronological.tsx` y `month-incomes-chronological.tsx`.
4. Quitar `editable={data.isCurrentMonth}` → siempre editable salvo evento CLOSED (regla existente).
5. FAB "Nuevo gasto" / "Agregar ingreso" en **cualquier** mes con record (no solo actual).
6. Badge fecha estimada (i18n `es`/`en`).

**Criterios de aceptación**

- [ ] Usuario navega a `/m/2026-01`, edita monto y fecha, borra línea — sin chat.
- [ ] Mismo flujo en mes futuro con ingreso previsto.
- [ ] Línea ESTIMATED muestra badge en listado cronológico.

**Archivos**

- `src/components/month/month-line-edit-dialog.tsx` (nuevo)
- `src/components/month/month-income-edit-dialog.tsx` (nuevo)
- `src/components/month/month-lines-chronological.tsx`
- `src/components/month/month-incomes-chronological.tsx`
- `src/components/month-dashboard.tsx`
- `src/lib/i18n/dictionaries/es.ts`, `en.ts`

---

### Fase 5 — Documentación, legal, release

**Entregables**

1. Actualizar specs: `months-and-templates`, `income`, `import-pdf-image`, `ai-agent`.
2. CHANGELOG ES+EN (minor, p.ej. `0.3.0`).
3. Legal-advisor pass.
4. Script rebucket legacy (opcional, documentado en design doc).

**Criterios de aceptación**

- [ ] Specs describen bucket por occurredOn y occurredOnSource.
- [ ] `npm run knowledge:lint` si aplica; CI verde.

---

## Orden de implementación (una persona / un agente)

```text
Fase 0 (design + schema + lib-rebucket)
    ↓
Fase 1 (REST)  ←── puede empezar tests de integración
    ↓
Fase 2 (tools) ←── depende de lib-rebucket
    ↓
Fase 3 (prompt) ←── en paralelo con Fase 4 una vez REST/tools estables
Fase 4 (UI)     ←── depende de Fase 1 REST
    ↓
Fase 5 (docs + legal + rebucket script opcional)
```

**Estimación orientativa:** 3–5 días de foco (schema + rebucket + REST + tools +
UI + prompt tuning + QA).

---

## Checklist QA (Telegram + web)

Copiar a `cross-month-crud-act-first-qa.md` al empezar Fase 5.

### Mes pasado

- [ ] Web: abrir mes anterior, editar gasto (monto, fecha, banco), borrar ingreso.
- [ ] Telegram: "en marzo pagué 200 de luz, corregilo a 220" → update correcto bucket.
- [ ] Agente no pregunta moneda si ya está confirmada.

### Mes futuro

- [ ] Web: alta ingreso 15/06 previsto (`received=false`) en vista junio.
- [ ] Telegram: "el 1 del mes que viene me depositan el aguinaldo 500" → bucket correcto.

### Fecha estimada

- [ ] Telegram: "gasté 3000 en super" sin fecha → hoy + badge estimada en web.
- [ ] CSV con fechas → ARTIFACT, sin badge estimada.

### Act-first

- [ ] "Borrá el último gasto del supermercado" con un solo match → borra sin pregunta previa.
- [ ] "Borrá el supermercado" con 3 matches → una pregunta corta con opciones.

### Regresión

- [ ] Demo `/demo` no aplica (Clara separada); smoke en `/m/<current>`, chat, Telegram link.
- [ ] Dedupe: reimportar misma fila CSV → duplicate silencioso.
- [ ] Eventos OPEN: attach/detach sigue funcionando tras rebucket.

---

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Rebucket rompe dedupe unique | Transacción: delete+create o update con check P2002 amigable |
| Líneas legacy mal bucketeadas | Script one-shot + opcional banner "reorganizamos tus meses" |
| Agente demasiado agresivo borrando | Act-first solo con match único o comando imperativo claro |
| Legal: "fecha estimada" implica certeza | Copy honesto: "asumimos hoy hasta que la corrijas" |

---

## Cuándo mover a `completed/`

- Todos los todos del frontmatter en `completed`.
- QA checklist marcado en staging/prod.
- Deploy en `clara.trefolio.com` sin regressions reportadas 48h.
- Bump del pin en trefolio (`npm run clara:update`) si Warren/trefolio depende de nuevos endpoints (opcional hoy).

---

## Referencias

- Specs: `knowledge/product-specs/months-and-templates.md`, `income.md`, `ai-agent.md`, `import-pdf-image.md`
- Código agente: `src/lib/ai/run-expense-agent.ts`, `src/lib/ai/expense-tools.ts`
- UI mes: `src/components/month-dashboard.tsx`, `src/components/month/*`
- Integración trefolio: trefolio `knowledge/design-docs/etracker-clara-integration.md`
