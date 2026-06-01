# QA — cross-month-crud-act-first

Checklist manual para validar el plan
[`cross-month-crud-act-first.md`](./cross-month-crud-act-first.md) antes de
cerrar el exec plan.

Marcar `[x]` en staging; repetir smoke en prod post-deploy.

---

## Setup

- Usuario de prueba con moneda confirmada, ≥2 bancos, mes actual y al menos un
  mes pasado con líneas.
- Telegram vinculado (opcional bloque Telegram).
- Locale ES y EN (una pasada cada uno en UI).

---

## 1. CRUD mes pasado (web)

- [ ] Navegar a `/m/YYYY-MM` (mes anterior).
- [ ] Editar gasto: nombre, monto, banco, categoría, fecha.
- [ ] Toggle pagado / no pagado persiste tras refresh.
- [ ] Borrar gasto desde menú del ítem.
- [ ] Editar ingreso: monto, fecha, `received`.
- [ ] Borrar ingreso.

## 2. CRUD mes pasado (Telegram / chat)

- [ ] "Mostrame cómo cerré abril" → datos coherentes con web.
- [ ] "En abril el alquiler era 800, ponelo en 850" → update sin crear duplicado.
- [ ] "Borrá el gasto de Netflix de marzo" (match único) → borra y confirma en una línea.

## 3. Mes futuro / previstos

- [ ] Web: en mes futuro, alta ingreso con fecha futura, `received=false`, badge previsto.
- [ ] Web: alta gasto futuro con `paid=false`.
- [ ] Chat: "el 20 del mes que viene pago el seguro 120" → bucket mes correcto, paid=false.

## 4. Fecha estimada vs artefacto

- [ ] Chat: "gasté 5000 en farmacia" (sin fecha) → occurredOn=hoy, badge "fecha estimada" en web.
- [ ] Editar fecha en web → badge desaparece o pasa a fecha confirmada (USER).
- [ ] CSV/PDF con fechas visibles → occurredOnSource=ARTIFACT, sin badge estimada.
- [ ] CSV fila sin fecha legible → agente pregunta O marca ESTIMATED solo si usuario confirma hoy.

## 5. Act-first (agente)

- [ ] Gasto simple en chat → registra sin preguntar banco si hay uno solo o contexto claro.
- [ ] Import "cargá todo" tras listado → una confirmación, no N turnos.
- [ ] Borrado ambiguo ("borrá el super") con 2+ líneas → una pregunta con opciones.
- [ ] Usuario dice "no" tras pregunta de borrado → no ejecuta tool.

## 6. Rebucket / consistencia

- [ ] Cambiar occurredOn de una línea de mes M a mes N → desaparece de vista M, aparece en N.
- [ ] Totales del mes M y N recalculan correctamente.
- [ ] Timeline anual (`getYearTimeline`) refleja cambio.

## 7. Regresión

- [ ] Plantillas `/expenses` y `/incomes` sin cambios rotos.
- [ ] Eventos OPEN: attach línea, cambiar fecha dentro del rango del evento.
- [ ] Dedupe: mismo gasto manual dos veces → segunda vez duplicate/amigable.
- [ ] MCP PAT: `updateMonthLine` + `deleteMonthLine` en mes pasado.
- [ ] Guest event wallet: scope no filtra tools de más.

## 8. CI

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm test`
- [ ] `npm run build`

---

## Notas de sesión

| Fecha | Entorno | Tester | Fallos |
|-------|---------|--------|--------|
| | | | |
