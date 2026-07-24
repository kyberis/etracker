# month-desktop-grid — Documento de requerimientos

> Vista desktop tipo planilla para los gastos del mes: tabla agrupada por banco,
> gráficos, edición inline, simulación “qué pasa si…”, y chat contextual por
> celda (input flotante estilo Cursor). Referencia visual:
> [`.cursor/mockups/month-excel-grid.html`](../../.cursor/mockups/month-excel-grid.html).

**Estado:** requerimientos para implementación (aún no shippeado).  
**Audiencia:** agente / ingeniero que implemente la feature end-to-end.  
**Producto:** Clara (`external/etracker`).  
**Idioma UI:** español rioplatense (voseo) + EN en paridad vía i18n.  
**Alcance de superficie:** **solo desktop** (viewport ≥ 1100px). En mobile /
tablet se mantiene la vista cronológica existente; no se fuerza esta grilla.

---

## 1. Resumen ejecutivo

### 1.1 Problema

Hoy el mes se ve como lista cronológica + cards de totales por banco. Eso es
bueno para “qué pasó día a día”, pero malo para:

- entender **estructura** del gasto (fijos vs puntuales, por banco, por categoría);
- corregir un dato mal cargado sin ir al chat;
- explorar **escenarios** (“¿y si no pido delivery?”) sin tocar datos reales;
- preguntar sobre un número concreto sin perder el contexto visual.

### 1.2 Propuesta

En `/m/[month]` (desktop), ofrecer un modo **Tabla** alternativo al cronológico,
con tres sub-vistas:

| Modo | Propósito |
|------|-----------|
| **Tabla** | Planilla agrupada por banco + chat por celda |
| **Gráficos** | 4 visualizaciones del mes (efectivo / simulado) |
| **Simular** | Escenario local no persistido: quitar o reducir gastos |

### 1.3 Principios de producto

1. **Chat-first no se rompe.** La tabla es un complemento; el chat global sigue
   existiendo. El chat flotante es un atajo contextual, no un reemplazo.
2. **Clara no da consejo financiero.** Insights y respuestas del chat contextual
   describen patrones y números (“sumás X en delivery”), nunca “deberías invertir”
   ni recomendaciones de productos.
3. **Simulación ≠ edición.** Simular nunca escribe a la DB. Editar sí.
4. **Primary currency.** Toda agregación usa `amountConverted`.
5. **Light-first.** Cream / ink / lime / peach / lilac (tokens de `globals.css`).
6. **Voz rioplatense.** Copy ES con voseo; ver skill `ux-writer`.

### 1.4 Mockup de referencia (fuente de verdad visual)

Archivo: `.cursor/mockups/month-excel-grid.html`

El implementador debe abrir el mockup y igualar:

- jerarquía tipográfica (Bricolage / Schibsted);
- densidad de la tabla;
- badges Recurrente / Puntual;
- input flotante (posición, chip de contexto, hints);
- panel de chat derecho;
- cards de gráficos;
- lista de simulación con checkbox + slider %.

Desvíos de marca respecto al mockup antiguo dark: **preferir el mockup light
actual** alineado a `globals.css`.

---

## 2. Objetivos y no-objetivos

### 2.1 Objetivos (must)

- O1. Ver gastos del mes en tabla agrupada por banco con subtotales y total.
- O2. Distinguir visualmente **Recurrente** vs **Puntual** en cada línea.
- O3. Filtrar Todos / Recurrentes / Puntuales con totales recalculados.
- O4. KPIs: total, recurrente, puntual, #bancos / líneas.
- O5. Click en celda/KPI → input flotante → pregunta → respuesta en panel derecho
  (agente real con contexto del ítem).
- O6. Doble click (campos editables) → editar y persistir vía APIs existentes.
- O7. Cuatro gráficos: categoría, banco, recurrente vs puntual, top N gastos.
- O8. Modo Simular: excluir gasto o reducir %, KPIs/gráficos reaccionan; sin persistir.
- O9. Desktop-only gate; toggle Tabla ↔ Cronológico.

### 2.2 No-objetivos (out of scope v1)

- Vista tabla en mobile / Capacitor.
- Edición tipo Excel multi-celda, copy-paste de rangos, fórmulas.
- Export CSV/XLSX (puede ser v1.1).
- Simulación persistida / escenarios nombrados.
- Comparar mes vs mes en la misma grilla (solo el mes activo).
- Editar ingresos en esta vista (solo gastos en v1).
- Drag-and-drop de filas.
- Reemplazar el chat principal del layout.

---

## 3. Usuarios y casos de uso

### 3.1 Usuario primario

Persona que ya usa Clara en web, tiene ≥1 banco y varias líneas en el mes,
prefiere desktop para “ordenar la cabeza” a fin de mes.

### 3.2 Casos de uso

| ID | Caso | Resultado esperado |
|----|------|--------------------|
| UC1 | Abrir mes en desktop y cambiar a Tabla | Ve grilla agrupada por banco |
| UC2 | Colapsar/expandir un banco | Subtotal visible; filas ocultas/visibles |
| UC3 | Filtrar “Puntuales” | Solo líneas no recurrentes; total = suma filtrada |
| UC4 | Click en monto de “Netflix” | Flota input con chip “Netflix · $ …” |
| UC5 | Pregunta “¿es mucho?” | Clara responde con contexto de esa línea en el panel |
| UC6 | Doble click en monto erróneo | Edita, Enter guarda, toast/feedback, KPIs se actualizan |
| UC7 | Marcar pagado con doble click en check | Toggle `paid` persistido |
| UC8 | Ir a Gráficos | Ve 4 charts coherentes con datos del mes |
| UC9 | En Simular, desmarcar delivery | KPI total baja; gráfico se actualiza; DB intacta |
| UC10 | Slider −50% en Disney+ | Monto efectivo a la mitad en KPI/charts |
| UC11 | “Sin delivery” preset | Todos los delivery off; ahorro simulado visible |
| UC12 | Resetear simulación | Vuelve a montos reales |
| UC13 | Viewport &lt; 1100px | No ofrece Tabla (o muestra aviso); cronológico intacto |
| UC14 | Preguntar “qué pasa si lo saco” en chat flotante | Clara explica impacto y sugiere usar Simular |

---

## 4. Diseño visual y UX

### 4.1 Layout general (desktop ≥ 1100px)

```
┌─────────────────────────────────────────────────────────────┐
│ Header mes: título + toggle [Tabla|Cronológico] + nav mes   │
│ Mode tabs: [Tabla] [Gráficos] [Simular]                     │
│ KPI strip: Total | Recurrente | Puntual | Bancos            │
│ Tip banner Clara (1 frase, patrones del mes / simulación)   │
├──────────────────────────────────────────┬──────────────────┤
│ Contenido del modo activo                │ Chat contextual  │
│ (tabla / charts / sim list)              │ (solo en Tabla)  │
└──────────────────────────────────────────┴──────────────────┘
```

- Ancho útil recomendado del shell: ~1280–1360px contenido.
- Radio de cards: ~1–1.25rem (tokens `--radius`).
- Fondo página: cream con gradientes suaves lilac/lime/peach (como app).
- Superficie principal: blanco translúcido / `surface-card`.

### 4.2 Tipografía

| Uso | Familia | Peso |
|-----|---------|------|
| Títulos / montos | `--font-display` (Bricolage Grotesque) | 600–800 |
| UI / tabla | `--font-sans` (Schibsted Grotesk) | 400–600 |
| Labels uppercase | sans, 10px, tracking amplio, `ink-muted` | 700 |

Montos: `font-variant-numeric: tabular-nums`.

### 4.3 Color y badges

| Elemento | Tratamiento |
|----------|-------------|
| Badge **Recurrente** | fondo lime suave, texto verde oscuro |
| Badge **Puntual** | fondo peach, texto terracota |
| Checkbox pagado | lime cuando `paid` |
| Dot de banco | color del banco (`Bank.color` o fallback paleta) |
| Fila hover | lime wash ~18% |
| Fila activa (contexto chat) | lime wash más fuerte + outline |
| Fila simulada off | opacity ~0.38 + line-through |
| Monto reducido por sim | color `--good` + hint “era $X” |

### 4.4 Densidad de tabla

- Font ~13–14px.
- Padding celda ~9–14px.
- Max-height del scroll de tabla ~52–58vh; thead sticky; total en `tfoot` sticky o siempre visible.
- Zebra suave cream en filas pares.

### 4.5 Input flotante (estilo Cursor)

- Aparece cerca del click (`position: fixed`), clamp a viewport.
- Card blanca blur, sombra suave, borde lime sutil.
- Chip “Preguntando sobre {label}”.
- Textarea auto-grow (max ~96px).
- Botón send (ink).
- 2–3 hint chips clicables que rellenan el textarea.
- Esc / click fuera (excepto nueva celda) cierra.
- Enter envía; Shift+Enter nueva línea.
- Animación entrada corta (~140ms).

### 4.6 Panel chat derecho

- Ancho ~300–340px.
- Bubbles: user alineado derecha (ink), Clara izquierda (cream).
- Avatar “C” en respuestas Clara.
- Estado vacío con instrucción breve.
- Footer con contexto activo.
- Botón Limpiar (solo limpia el hilo contextual de esta vista, no el chat global).
- Typing indicator 3 dots antes de la respuesta.

### 4.7 Gráficos

Cuatro cards en grid 2×2:

1. **Por categoría** — doughnut.
2. **Por banco** — bar vertical.
3. **Recurrente vs puntual** — doughnut (lime / peach).
4. **Top 8 gastos** — bar horizontal; recurrente=lime, puntual=warn/peach.

Altura chart ~220px. Leyendas compactas. Tooltips con moneda formateada
(`es-AR` / locale del usuario).

### 4.8 Simular

- Banner: ahorro simulado (delta grande en verde), total simulado, total real.
- Acciones: Resetear · preset “Sin delivery” (heurística por nombre/categoría
  documentada).
- Lista ordenada por monto desc: checkbox · nombre+meta · original · slider 0–100%
  step 5 · efectivo.
- Copy: dejar claro que **no se guarda** hasta que el usuario edite de verdad.

### 4.9 Microcopy (ES ejemplos — i18n keys reales en implementación)

- Título: “Gastos en tabla”
- Hint: “Click = preguntar · Doble click = editar · Simular = qué pasa si…”
- Tip vacío: “Clickeá cualquier número para preguntarme al toque.”
- Toast edit: “Dato actualizado”
- Sim reset: “Simulación reseteada”
- Aviso mobile: no empujar la grilla; mantener cronológico.

EN: traducción fiel, sin imitar lunfardo.

---

## 5. Comportamiento detallado por feature

### 5.1 Entrada al modo Tabla

- En el header del mes (`MonthDashboard` o equivalente), si `viewport ≥ 1100px`
  (match media + resize listener), mostrar toggle **Tabla | Cronológico**.
- Preferencia: `localStorage` key `clara.monthView.{userId}` = `table|chrono`
  (solo desktop; en mobile ignorar y forzar chrono).
- Deep link opcional v1.1: `?view=table`.
- Default v1: **Cronológico** (no sorprender); el tip banner puede mencionar la
  tabla una vez (feature discovery, dismissible).

### 5.2 Datos de la grilla

Fuente: mismo payload que el dashboard del mes (`MonthPageData` /
`MonthLinePayload[]`).

**Campos mostrados por fila**

| Columna | Fuente | Editable |
|---------|--------|----------|
| Fecha | `occurredOn` | No en v1 (rebucket complejo) |
| Concepto | `name` | Sí |
| Categoría | `category` | Sí (enum) |
| Tipo | derivado (ver 5.3) | Sí con reglas |
| Pagado | `paid` | Sí (toggle) |
| Monto | `amountConverted` (display) | Sí — ver moneda |

**Moneda al editar monto**

- Display siempre en `primaryCurrency` vía `amountConverted`.
- Al editar: el usuario edita el monto en la **moneda de la línea** (`amount` +
  `currency`) **o** en primary — **decisión v1:** editar `amount` en
  `currency` de la línea y recalcular `amountConverted` con el `fxRate`
  congelado existente (no re-fetchear FX al editar monto, salvo que el producto
  ya lo haga en `updateMonthLine`). Documentar en UI el ISO de la moneda.
- Si el mockup simplifica a un solo número ARS, en producto real respetar multi-FX.

**Agrupación**

- Group by `bankId`, orden de bancos: el mismo que `bankTotals` del mes (o
  alfabético estable).
- Fila grupo: chevron, color, nombre, count, subtotal (`sum amountConverted`
  de líneas visibles del grupo).
- Click chevron / fila grupo (excepto celdas ask del nombre/total): toggle
  collapse. Estado collapse en memoria de sesión (no obligatorio persistir).

**Total visible**

- Suma de líneas que pasan el filtro **y** (si sim activa) montos efectivos.
- En modo Tabla sin sim: montos reales.
- Cuando hay simulación activa global en la sesión, la tabla puede mostrar
  montos efectivos + “era $X” (como mockup) — **sí en v1** si el usuario
  simuló y no reseteó; banner KPI muestra delta.

### 5.3 Recurrente vs Puntual

Hoy `MonthLinePayload` **no expone** `isRecurring`. Requisito de backend/DTO:

```ts
// Añadir a MonthLinePayload
kind: "RECURRING" | "ONE_OFF";
// Regla:
// - si templateId != null && template.isRecurring === true → RECURRING
// - si templateId != null && template.isRecurring === false → ONE_OFF (template puntual del mes)
// - si templateId == null → ONE_OFF
```

Incluir `templateId` en el payload si aún no está (útil para chat y para
decidir si editar tipo afecta template).

**Editar tipo**

| Acción | Persistencia |
|--------|--------------|
| ONE_OFF → RECURRING | Crear/actualizar template recurrente (o `isRecurring=true` si ya hay template). Requiere confirmación si implica meses futuros. **v1 simplificado:** solo cambiar flag del template si existe; si no hay template, ofrecer “crear template recurrente a partir de esta línea” vía modal/confirm. |
| RECURRING → ONE_OFF | Si hay template: no borrar template global sin confirmación. **v1:** marcar solo esta línea como excepción documentada **o** pedir confirmación “¿pasar el template a puntual?”. Preferir confirmación clara. |

Si la regla completa es riesgosa, **v1 MVP:** tipo es **read-only** en UI y solo
se muestra el badge; la edición de tipo queda v1.1. El mockup permite editarlo —
el implementador debe elegir MVP read-only **o** flujo con confirmación; dejar
test y copy acordes. **Recomendación de producto:** badge editable con
confirmación solo cuando hay `templateId`.

### 5.4 Filtros

- Todos / Recurrentes / Puntuales.
- Recalcula subtotales de grupo, total, y (si aplica) charts si se filtra solo
  en tabla — **charts y sim usan siempre el mes completo**, no el filtro de
  tabla (evitar confusión). Documentar en UI del filtro: “Filtra la tabla”.

### 5.5 KPIs

| KPI | Cálculo |
|-----|---------|
| Total mes | `sum(effectiveAmountConverted)` |
| Recurrente | sum where kind=RECURRING |
| Puntual | sum where kind=ONE_OFF |
| Bancos | count distinct bankId con ≥1 línea activa en sim |

Bajo Total, si `baseline - effective > 0`, mostrar “−$X vs real”.

Click en KPI abre float ask con contexto de ese agregado.

### 5.6 Chat contextual (flotante + panel)

**Trigger:** single click en celda ask / KPI (delay ~200–250ms para no pelear con
dblclick).

**Contexto enviado al agente** (system/tool o mensaje estructurado):

```ts
type CellAskContext = {
  month: string; // yyyy-MM
  focus:
    | { type: "line"; lineId: string; field: string }
    | { type: "bank"; bankId: string }
    | { type: "kpi"; kpi: "total" | "recurring" | "oneoff" | "banks" };
  snapshot: {
    // línea o agregados relevantes, montos en primaryCurrency
  };
};
```

**Implementación recomendada**

- Reutilizar el loop del agente (`ai-agent`) con un prompt system extra:
  “El usuario pregunta sobre este ítem del mes; respondé breve con números;
  no inventes líneas; si falta data, pedila.”
- Tools: permitir read tools del mes; **no** mutar salvo que el usuario lo pida
  explícitamente (“marcá como pagado”).
- Streaming al panel derecho (no al chat global), a menos que se unifique
  después.
- Rate limit / quota: **sí cuenta** contra la cuota diaria de chat del usuario
  (misma que el chat web). Si 429, mostrar upsell existente.

**Respuestas**

- Cortas (3–8 líneas), con montos formateados.
- Si preguntan “qué pasa si lo saco”, calcular impacto aritmético y sugerir
  pestaña Simular (sin sermón financiero).

**Hints sugeridos** (locales): dependen del contexto (línea / banco / kpi).

### 5.7 Edición inline

| Campo | Interacción | API |
|-------|-------------|-----|
| name | dblclick → input text → Enter | `PATCH` month-expense-line |
| category | dblclick → select enum | idem |
| paid | dblclick → toggle inmediato | idem |
| amount | dblclick → number | idem (+ FX rules) |
| type | ver 5.3 | template/line APIs |

- Esc cancela.
- Optimistic UI + rollback en error.
- Toast / inline error de `withApi`.
- Tras éxito: invalidar/refetch month state; refrescar KPIs, tabla, charts.
- No abrir float ask en el mismo gesto que edita.

### 5.8 Gráficos

Datos: líneas del mes con `effectiveAmount` (sim).

| Chart | Tipo | Notas |
|-------|------|-------|
| Categoría | doughnut | labels i18n de `ExpenseCategory` |
| Banco | bar | colores de banco |
| Tipo | doughnut | Recurrente / Puntual |
| Top 8 | bar horizontal | nombre truncado ~18 chars |

Librería: la que ya use el repo si existe; si no, **Chart.js** o Recharts
alineado a Next 16 / React. Preferir una sola lib charts del monorepo Clara.

Empty state: “No hay gastos este mes” centrado.

Accesibilidad: texto alternativo / data table colapsable “Ver datos” bajo cada
chart (nice-to-have v1; must v1.1).

### 5.9 Simulación

Estado en cliente (React state), **no** localStorage obligatorio; al salir del
mes o unmount, se pierde (OK). Opcional: `sessionStorage` para no perder al
cambiar Tabla↔Gráficos.

Por línea:

```ts
sim: { included: boolean; cutPct: number } // cutPct 0..100 step 5
effective = included ? amountConverted * (1 - cutPct/100) : 0
```

Presets:

- **Resetear:** included=true, cutPct=0 para todas.
- **Sin delivery:** `included=false` donde categoría ALIMENTACION y
  nombre match `/pedidos|rappi|delivery|uber\s*eats/i` (configurable
  lista). Documentar heurística; no marcar supermercado genérico.

Banner:

- `saved = baselineTotal - effectiveTotal`
- Copy: “Ahorro simulado” / “Total simulado” / “Total real”

Simulación activa debe reflejarse en KPIs y Gráficos mientras `saved > 0` o
alguna línea modificada.

### 5.10 Tip banner Clara

Reglas simples (determinísticas, sin LLM obligatorio en v1):

1. Si hay simulación con saved > 0 → “Con la simulación te ahorrás $X…”
2. Else si puntual% ≥ 35 → “Este mes el N% fue puntual…”
3. Else → tip genérico de usar click para preguntar.

Opcional v1.1: tip generado por LLM una vez al abrir el mes.

---

## 6. Arquitectura e integración

### 6.1 Dónde vive el código (propuesto)

| Layer | Path |
|-------|------|
| UI shell / toggle | `src/components/month/month-dashboard.tsx` (o equivalente) |
| Vista tabla | `src/components/month/month-excel-grid.tsx` |
| Sub: charts | `src/components/month/month-excel-charts.tsx` |
| Sub: sim | `src/components/month/month-excel-sim.tsx` |
| Sub: float ask | `src/components/month/month-cell-ask.tsx` |
| Sub: contextual chat | `src/components/month/month-cell-chat-panel.tsx` |
| DTO / kinds | `src/lib/month-page-types.ts` |
| Mapper kind | `src/lib/month-line-kind.ts` + tests |
| API lines | existentes `src/app/api/month-expense-lines/` |
| Agent context | `src/lib/ai/` — helper `buildCellAskSystemPrompt` |
| i18n | `src/lib/i18n/dictionaries/es.ts`, `en.ts` |
| Mockup | `.cursor/mockups/month-excel-grid.html` |
| Spec | este archivo |

### 6.2 Contratos API

**Lectura:** sin endpoint nuevo si el month payload se enriquece con `kind` (+
`templateId` si falta).

**Escritura edición:** reutilizar PATCH/PUT de month expense lines y, si aplica,
expense templates. Validación Zod existente; errores vía `withApi()`.

**Chat contextual:** 

- Opción A (preferida): `POST` al mismo stream de chat web con header/body
  `context: CellAskContext` y `surface: "month-grid"`.
- Opción B: endpoint dedicado `/api/month-cell-ask` que llama al agent loop.
  Más aislamiento de UI; más código. Preferir A si el stream actual lo permite.

### 6.3 Invariantes

1. Simulación nunca llama APIs de escritura.
2. Toda suma usa `amountConverted` (primary).
3. Cada línea de gasto tiene `bankId` no nulo.
4. Desktop gate: no montar grid pesado en mobile (código split / conditional).
5. Chat contextual consume cuota como el chat normal.
6. Clara no inventa líneas que no están en el snapshot.
7. Editar `occurredOn` no está en esta UI (evita rebucket accidental).

### 6.4 Feature flag

Recomendado: flag `month_desktop_grid` (default off en prod hasta QA).

Ver design doc de feature flags del repo si aplica; si Clara no tiene flags
homogéneas, usar env `NEXT_PUBLIC_MONTH_GRID=1` temporal.

### 6.5 Legal / compliance

- No nuevo procesador de datos.
- El chat contextual envía al modelo los mismos tipos de datos financieros que
  el chat actual (montos, nombres, categorías) — **sí** dispara revisión
  `legal-advisor` al implementar (AI features).
- Insights no son consejo de inversión; disclaimer existente del producto se
  mantiene.
- No claims nuevos en landing hasta ship + changelog.

### 6.6 Changelog

Al shippear: entrada en `marketing-content.ts` CHANGELOG ES+EN (minor bump).

---

## 7. Calidad — métricas de producto

### 7.1 Métricas de éxito (post-launch, 2–4 semanas)

Instrumentar solo si ya hay analytics en Clara; si no hay telemetría, usar
logs estructurados / conteos server-side mínimos sin PII.

| Métrica | Definición | Target orientativo |
|---------|------------|-------------------|
| Adoption | % sesiones desktop mes que abren Tabla ≥1 vez | ≥ 25% de power users desktop |
| Engagement | Mediana de minutos en vista Tabla por sesión que la abre | ≥ 1.5 min |
| Edit from grid | # ediciones inline / semana | > 0 y creciente |
| Sim use | % usuarios Tabla que abren Simular | ≥ 15% |
| Cell ask | # preguntas contextuales / semana | track; no target duro v1 |
| Error rate edit | % PATCH fallidos desde grid | &lt; 2% |
| Perf | TTI grid con 200 líneas | ver §8 |

### 7.2 Métricas de calidad internas (CI / release)

| Señal | Gate |
|-------|------|
| Unit tests kind + effectiveAmount + presets | pass |
| Typecheck / lint | pass |
| Build | pass |
| Bundle: chunk de grid no en critical path mobile | no import en mobile layout |
| a11y smoke (teclado float + edición) | checklist QA |

### 7.3 SLOs UX

| Interacción | Objetivo |
|-------------|----------|
| Abrir Tabla (datos ya en memoria) | &lt; 100ms percibido (sin refetch obligatorio) |
| Aplicar filtro | &lt; 50ms para ≤300 líneas |
| Abrir float ask | &lt; 50ms |
| Primera token chat contextual | mismo orden que chat web |
| Actualizar charts tras sim slider | &lt; 100ms debounce 50–100ms |
| Guardar edición | feedback &lt; 300ms optimistic; confirm server &lt; 2s p95 |

---

## 8. Performance

- Virtualizar filas si `lines.length > 100` (react-virtuoso o similar).
- Charts: no re-crear instancia Chart en cada keystroke del slider; `update()`
  con debounce.
- Code-split: `import()` dinámico de la vista Tabla solo si desktop + flag +
  usuario elige Tabla.
- No refetch completo del mes en cada toggle collapse.
- Memorizar agregaciones por bank/category cuando el array de líneas no cambia
  (referencia estable).

Presupuesto: mes con **500 líneas** debe seguir usable (scroll + collapse).

---

## 9. Accesibilidad

- Tabla semántica `<table>` con `<th scope>`.
- Filas grupo: `button` o `aria-expanded` en chevron.
- Float ask: `role="dialog"`, focus trap liviano, Esc cierra, restore focus a
  celda.
- Contraste badges ≥ WCAG AA sobre cream.
- No depender solo del color para Recurrente/Puntual (texto en badge).
- Slider sim: `aria-valuetext` con % y monto efectivo.
- Charts: resumen textual o tabla de datos (v1.1 must si no entra en v1).

---

## 10. i18n

- Todas las strings UI en dictionaries ES/EN.
- Categorías: ya localizadas o mapear labels.
- Formato moneda: `Intl` con locale del usuario + `primaryCurrency`.
- Fechas: `occurredOn` como dd/MM o locale.
- Hints del float y tips del banner: i18n.

---

## 11. Testing

### 11.1 Unit (Vitest)

| Suite | Qué cubre |
|-------|-----------|
| `month-line-kind.test.ts` | Reglas RECURRING / ONE_OFF |
| `month-sim.test.ts` | effectiveAmount, saved, preset delivery, reset |
| `month-aggregates.test.ts` | totals by bank/cat/type/topN |
| `buildCellAskContext.test.ts` | shape del contexto |

### 11.2 Component tests (Vitest + Testing Library)

- Render tabla con 2 bancos, collapse.
- Filtro puntual oculta recurrentes.
- Dblclick name llama mutate mock.
- Single click abre dialog ask (fake timers para delay).
- Sim toggle actualiza KPI total.
- Viewport mock &lt; 1100: toggle Tabla no visible.

### 11.3 Agent / integration

- Cell ask con snapshot fijo: el system prompt incluye el lineId y monto.
- Quota 429: UI muestra mensaje conocido.

### 11.4 QA manual (checklist pre-merge)

- [ ] Abrir mockup y comparar layout side-by-side con `/m/current` Tabla.
- [ ] Multi-currency line: editar monto no corrompe fx.
- [ ] Template recurrente: badge correcto.
- [ ] Línea sin template: Puntual.
- [ ] Simular + Gráficos coherentes; Reset restaura.
- [ ] Chat flotante no dispara edit; dblclick no abre chat.
- [ ] Mobile real / DevTools: cronológico OK, sin grid rota.
- [ ] Usuario sin bancos / mes vacío: empty states.
- [ ] Dark mode: si la app fuerza light, no romper; no invertir a dark genérico.

### 11.5 Regresión

- Cronológico existente sin cambios de comportamiento.
- Bank totals cards (si siguen en chrono) intactos.
- Agent tools month CRUD no regresan.

### 11.6 Definition of Done

1. Flag on en preview; checklist QA OK.
2. Spec + changelog actualizados.
3. Tests unitarios verdes en CI.
4. Legal-advisor check anotado (AI surface).
5. Performance smoke con dataset seed ≥ 100 líneas.
6. Mockup marcado como “implemented” en comentario del HTML o link desde spec.

---

## 12. Seguridad y privacidad

- Auth igual que dashboard mes (sesión requerida).
- No exponer líneas de otro user (APIs ya scoped).
- Contexto al LLM: mínimo necesario (línea focus + agregados); no mandar todo el
  historial bancario si no hace falta.
- No loguear montos en cleartext en client analytics si se agregan eventos;
  preferir event names sin PII (`grid_cell_ask`, `grid_edit_save`, `grid_sim_preset`).

---

## 13. Plan de implementación sugerido (fases)

### Fase 0 — Foundation (0.5–1 d)

- Extender DTO `kind` + tests.
- Toggle desktop Tabla/Cronológico + empty shell.
- Feature flag.

### Fase 1 — Tabla read-only (1–2 d)

- Grid agrupada, filtros, KPIs, collapse.
- Paridad visual básica con mockup.

### Fase 2 — Edición (1 d)

- Inline edit name/category/paid/amount.
- Toasts + refetch.

### Fase 3 — Charts + Sim (1–2 d)

- 4 charts.
- Sim state + presets + wiring a KPI/charts.

### Fase 4 — Cell ask (1–2 d)

- Float UI + panel.
- Wire agent stream + quota.
- Hints i18n.

### Fase 5 — Hardening (1 d)

- a11y, virtualize si hace falta, legal note, changelog, QA checklist.

**Estimación total:** ~5–8 días de ingeniería enfocada.

---

## 14. Criterios de aceptación (resumen testeable)

1. En desktop ≥1100px, el usuario puede alternar Cronológico ↔ Tabla.
2. La tabla lista todos los gastos del mes agrupados por banco con subtotales
   correctos en `primaryCurrency`.
3. Cada fila muestra badge Recurrente o Puntual según reglas §5.3.
4. Filtros recalculan subtotales y total visible.
5. KPIs coinciden con la suma de líneas (y con sim si activa).
6. Click en celda abre input flotante anclado al cursor/viewport.
7. Una pregunta genera respuesta de Clara en el panel derecho usando el
   contexto del ítem (no genérica sin datos).
8. Doble click edita y persiste campos acordados; Esc cancela.
9. Gráficos reflejan el mes; con sim, reflejan montos efectivos.
10. Simular no llama APIs de escritura; Reset vuelve al baseline.
11. Mobile no muestra la grilla como experiencia rota.
12. Copy ES rioplatense; EN presente.
13. Tests unitarios de kind + sim + aggregates en CI.
14. Feature detrás de flag hasta QA.

---

## 15. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|------------|
| Confundir Simular con borrar de verdad | Copy explícito + nunca persistir sim |
| Editar tipo rompe templates | MVP read-only o confirmación fuerte |
| Cuota chat disparada por curiosidad | Hints cortos; respuestas breves; mismo upsell 429 |
| Performance 500+ líneas | Virtualización fase 5 |
| Doble click vs click | Delay 220ms + cancel en dblclick |
| Clara “aconseja” de más | Prompt: solo patrones y números; skill ux-writer |

---

## 16. Known gaps / TODOs abiertos

Decisiones cerradas en el exec plan
[`../exec-plans/active/month-desktop-grid.md`](../exec-plans/active/month-desktop-grid.md):

- [x] Tipo badge **read-only** en v1
- [x] Cell-ask panel aislado (no mezcla chat global)
- [x] Preset delivery por categoría + regex
- [x] `templateId` + `kind` en payload
- [x] Flag `NEXT_PUBLIC_MONTH_DESKTOP_GRID`
- [ ] Tabla de datos a11y bajo charts → v1.1
- [ ] Virtualización si >100 líneas → follow-up si hace falta
- [ ] Editar tipo (recurrente/puntual) → v1.1

---

## 17. Related

- **Exec plan (implementación):** [`../exec-plans/active/month-desktop-grid.md`](../exec-plans/active/month-desktop-grid.md)
- Mockup: [`.cursor/mockups/month-excel-grid.html`](../../.cursor/mockups/month-excel-grid.html)
- Spec base datos: [`months-and-templates.md`](months-and-templates.md)
- Banks: [`banks.md`](banks.md)
- Agent: [`ai-agent.md`](ai-agent.md)
- UX voice: [`.cursor/skills/ux-writer/SKILL.md`](../../.cursor/skills/ux-writer/SKILL.md)
- Legal AI: [`.cursor/skills/legal-advisor/SKILL.md`](../../.cursor/skills/legal-advisor/SKILL.md)
- Chrono UI actual: `src/components/month/month-lines-chronological.tsx`
- Bank totals: `src/components/month/month-bank-totals.tsx`
- Types: `src/lib/month-page-types.ts`

---

## 18. Apéndice — Mapa mockup → producto

| Pieza mockup | Producto |
|--------------|----------|
| Datos hardcodeados ARS | `MonthLinePayload` + `primaryCurrency` |
| `isRecurring` boolean local | `kind` derivado de template |
| Respuestas Clara fake | Agent stream real + tools read |
| Sim en memoria JS | React state / sessionStorage |
| Chart.js CDN | Dependencia del repo / dynamic import |
| Toast simple | Mismo sistema toast/sonner de la app |
| “Sin delivery” | Preset con heurística documentada |
| Toggle Cronológico no navega | Toggle real que desmonta/monta vistas |

---

*Fin del documento de requerimientos. Cualquier ambigüedad de §16 debe
resolverse antes o durante Fase 0 y anotarse aquí.*
