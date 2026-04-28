<div align="center">

<img src="public/ada-avatar.png" width="120" alt="Ada — asistente financiera con IA" />

# Ada

### Tu plata, finalmente clara.

**Asistente financiera con IA, open source y rioplatense.** Mandale una foto del banco, un PDF, una nota de voz por WhatsApp — Ada extrae los movimientos, sugiere categorías y mantiene tu balance al día.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#-licencia)
[![GitHub Repo stars](https://img.shields.io/github/stars/kyberis/etracker?style=social)](https://github.com/kyberis/etracker/stargazers)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma)](https://www.prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Vercel AI Gateway](https://img.shields.io/badge/AI-Vercel%20AI%20Gateway-000?logo=vercel)](https://vercel.com/ai-gateway)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/ci.yml)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#-contributing)

**[Live demo](https://ada.trefolio.com) · [Quick start](#-quick-start) · [Features](#-una-asistente-no-una-planilla) · [MCP](#-tu-propio-ai-puede-hablar-con-ada) · [Contributing](#-contributing)**

</div>

> ### ⭐ Si te gusta lo que ves, dale una star.
>
> Ada es 100% open source y se mantiene **a pulmón**, sin VC ni planes pagos. Una star en GitHub es gratis, tarda dos segundos y nos avisa que vale la pena seguir construyendo en abierto. **[Star Ada acá](https://github.com/kyberis/etracker)** — gracias 🙏.

---

## 💬 Esto es Ada en dos mensajes

> **Vos:** Pagué el alquiler hoy, $850
>
> **Ada:** Listo, marqué **Alquiler** como pagado en abril ✅. Te quedan **$1.240** para los gastos pendientes del mes.
>
> **Vos:** _\[adjuntás un PDF del banco\]_
>
> **Ada:** Dale, ya lo procesé. Te encontré 14 movimientos, 9 ya estaban planificados y los marqué como pagados. Quedan **5 gastos nuevos** — mirá la propuesta y confirmá los que quieras registrar.

Sin filas infinitas. Sin categorías que tildás manualmente. Sin abrir la app.

## ✨ ¿Por qué otra app de finanzas?

La mayoría son lo mismo de siempre:

- 🪦 **Planillas con mejor diseño** — filas, categorías, reportes. Bonitas las primeras dos semanas; muertas al segundo mes.
- 🔒 **Jardines cerrados** — tus datos viven en la base de datos de otra empresa, pagás todos los meses, y las features de IA son un upsell de $9.99.

**Ada es chat-first, open source y self-hosteable.** Hablás con tu plata en lenguaje normal, le tirás un PDF y entiende, le mandás una nota de voz y registra el gasto. La IA es **el núcleo del producto**, no una etiqueta de marketing.

> Ada habla **español rioplatense** porque es lo que usan los maintainers y los prompts del asistente. Cambiar al inglés u otro dialecto es un PR de pocas líneas en `src/lib/ai/run-expense-agent.ts`. PRs bienvenidos. 🌎

## 🎯 Una asistente, no una planilla

Cada feature está pensada para que entiendas tu plata sin abrir Excel — y para que tu propio AI assistant pueda ayudarte sin pedirte permiso quince veces.

| | |
|---|---|
| 🤖 **Lee tus extractos** | Tirá una captura del banco, un PDF o un CSV. Ada extrae los movimientos, sugiere categorías y siempre pregunta antes de tocar nada. |
| 🎙️ **Escucha notas de voz** | "Pagué el alquiler" por WhatsApp es suficiente. Ada transcribe, clasifica y actualiza el mes sin que abras la app. |
| 🔄 **Se sincroniza con tu banco** | Open Banking de **solo lectura**. Conectás tu banco una vez, sincronizás por mes, y Ada matchea transacciones con tus gastos planificados. Ada nunca tiene acceso a tu dinero. |
| 📅 **Organizada por mes** | Una plantilla define un gasto recurrente. Cada mes tiene su copia independiente que tildás cuando lo pagás. |
| 🏦 **Multi-banco real** | Cada gasto sabe en qué banco vive. Útil cuando repartís el alquiler entre tres cuentas y querés saber cuánto te queda en cada una. |
| 📊 **Visualiza solo cuando ayuda** | Ada no tira gráficos por tirar. Los renderiza inline solo cuando suman para entender lo que está pasando. |
| 💬 **Habla en rioplatense** | Sin inglés corporativo ni tuteo. Ada habla como una amiga contadora que sabe lo que hace — sin sermones, prometido. |
| 🔓 **Tu data es tuya** | Open source MIT. Self-hosteable en cualquier Vercel/Postgres. Sin telemetría, sin tracking, sin upsell de IA a $9.99/mes. |
| 🤝 **MCP para tu AI** | Ada expone un servidor MCP. Conectalo a Claude Desktop, Cursor o ChatGPT y tu propio asistente puede consultar y actualizar tus finanzas con tu permiso. |

## 🤝 Tu propio AI puede hablar con Ada

Ada expone un servidor **MCP (Model Context Protocol)**. Generás un token desde **Settings → Acceso para AI** y lo pegás en Claude Desktop, Cursor o cualquier cliente compatible: tu asistente consulta tus meses, mira el balance y registra gastos con tu permiso.

```json
{
  "mcpServers": {
    "ada": {
      "url": "https://ada.trefolio.com/api/mcp/user",
      "headers": { "Authorization": "Bearer ada_pat_..." }
    }
  }
}
```

Tools disponibles: `getProfile`, `listBanks`, `listExpenseTemplates`, `listMonths`, `getMonth`, `getCurrentBalance`, `getYearTimeline`, `addExpenseTemplate`, `addExpenseToMonth`, `markLinePaid`, `deleteLine`, `createBank`. Discovery: `/.well-known/mcp.json`. Tokens hasheados con sha-256, expirables y revocables desde Settings.

> Si esta combinación (MCP + finanzas + open source) te resulta interesante, **[dejá una star](https://github.com/kyberis/etracker)** así más gente la descubre.

## 🖼️ Screenshots

> _Próximamente — subí tus capturas a `docs/screenshots/` y linkeálas acá._

```
[ Dashboard mensual ]   [ Chat IA con tus extractos ]   [ Timeline anual ]
```

## 🚀 Quick start

```bash
# 1. Clonar e instalar
git clone https://github.com/kyberis/etracker.git
cd etracker
npm install

# 2. Configurar entorno
cp .env.example .env
# Completar DATABASE_URL, NEXTAUTH_URL, NEXTAUTH_SECRET (el resto es opcional)

# 3. Levantar Postgres
docker compose up -d

# 4. Correr migraciones
npm run prisma:migrate

# 5. Iniciar la app
npm run dev
```

Abrí <http://localhost:3000> y creá tu cuenta.

> 💡 **¿Sin Docker?** Cualquier Postgres 14+ funciona. Apuntá `DATABASE_URL` a él.

## 🧱 Tech stack

- **Next.js 16** (App Router, RSC, Turbopack) · **React 19** · **TypeScript 5**
- **Tailwind CSS 4** · **shadcn/ui** · **Lucide icons**
- **NextAuth v4** (estrategia JWT + adaptador Prisma)
- **Prisma 7** · **PostgreSQL 16**
- **Vercel AI SDK 6** enrutado vía **Vercel AI Gateway** (multi-proveedor, failover, tracking de costos)
- **Vercel Blob** (audio TTS) · **Vercel Runtime Cache** (bancos, timeline anual)
- **Upstash Redis** (rate limiting)
- **Twilio** (WhatsApp) · **GoCardless Bank Account Data API** (Open Banking)
- **Vitest** (unit tests) · **GitHub Actions** (CI)

## 🏗️ Architecture

```
┌──────────────────────┐    ┌────────────────────────┐    ┌──────────────────┐
│  Next.js App Router  │ ── │  Vercel AI Gateway     │ ── │  OpenAI / etc.   │
│  (RSC + Server fns)  │    │  (failover, cost)      │    │                  │
└─────────┬────────────┘    └────────────────────────┘    └──────────────────┘
          │
          │  ┌──────────────┐    ┌──────────────────┐
          ├──│  Postgres    │    │  Vercel Blob     │  TTS audio
          │  │  (Prisma)    │    │                  │
          │  └──────────────┘    └──────────────────┘
          │
          │  ┌──────────────────┐  ┌──────────────────┐
          ├──│ Vercel Runtime   │  │ Upstash Redis    │  Rate limits
          │  │ Cache (banks,    │  │                  │
          │  │ year timeline)   │  └──────────────────┘
          │  └──────────────────┘
          │
          │  ┌────────────┐  WhatsApp  ┌────────────────┐
          └──│  Twilio    │ ◄────────► │ GoCardless OB  │  Bank sync
             └────────────┘            └────────────────┘
```

El wrapper centralizado `withApi()` en [`src/lib/http.ts`](src/lib/http.ts) maneja errores Zod, errores Prisma, códigos de negocio (`UNAUTHORIZED`, `GOCARDLESS_MISSING_SECRETS`, …) para que los route handlers sean pequeños y consistentes.

## 📁 Estructura del repo

```
src/
  app/                 Next.js App Router
    (app)/             Shell autenticado (bancos, meses, configuración…)
    (auth)/            UI de login / registro
    (marketing)/       Landing pública, features, FAQ, changelog, privacy
    api/               Handlers REST — todos usan withApi()
  components/
    month/             Subcomponentes que componen <MonthDashboard />
    ui/                Primitivos shadcn
  lib/
    ai/                Agente, herramientas, transcripción, TTS
    cache/             Wrappers de Vercel Runtime Cache (bancos)
    blob/              Helpers de Vercel Blob (TTS)
    revolut/           Integración GoCardless + clasificador IA
    whatsapp/          Twilio + helpers de link-code
    http.ts            Wrapper withApi() usado por cada route handler
    log.ts             Helper de log estructurado (listo para Sentry)
prisma/                Schema + migraciones
public/                Assets estáticos (sw.js, iconos, manifests…)
.github/workflows/     CI (lint, typecheck, test, build)
```

## ⚙️ Configuración

### Variables de entorno (lista completa en [`.env.example`](./.env.example))

<details>
<summary><strong>Core</strong> (requeridas)</summary>

| Variable          | Notas                                                                |
| ----------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`    | Cadena de conexión PostgreSQL. Usá la URL pooled en Neon / Vercel.   |
| `NEXTAUTH_URL`    | URL pública (ej. `http://localhost:3000`).                           |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32`                                            |

</details>

<details>
<summary><strong>IA</strong> (Vercel AI Gateway, recomendado)</summary>

| Variable               | Descripción                                                         |
| ---------------------- | ------------------------------------------------------------------- |
| `VERCEL_OIDC_TOKEN`    | Auto-provisionado por `vercel env pull` (preferido en Vercel).      |
| `AI_GATEWAY_API_KEY`   | Fallback para CI runners y dev local fuera de `vercel`.             |
| `AI_MODEL`             | Override del modelo de chat (default `openai/gpt-5.4`). Formato `provider/model`. |
| `AI_CLASSIFIER_MODEL`  | Override del modelo clasificador (default `openai/gpt-4.1-mini`).   |
| `OPENAI_API_KEY`       | Requerido para TTS y transcripción Whisper.                         |

```bash
vercel link
vercel env pull .env.local   # trae VERCEL_OIDC_TOKEN; rotar cada ~12h
```

</details>

<details>
<summary><strong>Integraciones opcionales</strong></summary>

| Grupo              | Variables                                                                |
| ------------------ | ------------------------------------------------------------------------ |
| Google sign-in     | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                               |
| WhatsApp / Twilio  | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`        |
| Voz WhatsApp       | `WHATSAPP_VOICE_REPLY=true`, `OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`      |
| Storage TTS        | `BLOB_READ_WRITE_TOKEN` (Vercel Blob)                                    |
| Sincronización bancaria | `GOCARDLESS_SECRET_ID`, `GOCARDLESS_SECRET_KEY`                     |
| Rate limits        | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                     |
| Sentry             | `SENTRY_DSN` (reenvía `log.error(...)` si `@sentry/nextjs` está instalado)|

</details>

## 🧪 Scripts

| Script                    | Descripción                                          |
| ------------------------- | ---------------------------------------------------- |
| `npm run dev`             | Iniciar servidor de desarrollo (Turbopack)           |
| `npm run build`           | Build de producción                                  |
| `npm run start`           | Iniciar servidor de producción                       |
| `npm run lint`            | ESLint                                               |
| `npm test`                | Correr suite Vitest una vez                          |
| `npm run test:watch`      | Vitest en modo watch                                 |
| `npm run format`          | Prettier                                             |
| `npm run prisma:migrate`  | Migración de desarrollo                              |
| `npm run prisma:deploy`   | Aplicar migraciones en producción                    |

## 🔌 MCP — endpoints públicos

Ada expone dos servidores MCP que cualquier cliente compatible puede consumir.

### Público — `/api/mcp`

Sin auth. Expone documentación de Ada (features, FAQ, changelog, privacy) como resources, tools y prompts. Útil para que tu asistente AI pueda responder preguntas sobre el producto.

```json
{
  "mcpServers": {
    "ada": { "url": "https://ada.trefolio.com/api/mcp" }
  }
}
```

### Per-user — `/api/mcp/user`

Autenticado con bearer token. Cada usuario genera un token desde **Settings → Acceso para AI (MCP)** y lo pega en su cliente MCP. Ver [sección anterior](#-tu-propio-ai-puede-hablar-con-ada) para el snippet de configuración y la lista de tools.

## 🔍 SEO + AI SEO

Ada está optimizada para search engines tradicionales **y** crawlers de IA (ChatGPT, Claude, Perplexity, Gemini):

- **Sitemap** dinámico en `/sitemap.xml` con `hreflang` es-AR / es.
- **robots.txt** con políticas explícitas para `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`, `Claude-Web`, `anthropic-ai`, `PerplexityBot`, `Google-Extended`, `Applebot-Extended`, `Amazonbot`, `Bytespider`, `CCBot`, `Meta-ExternalAgent`, `MistralAI-User`, etc.
- **JSON-LD** en cada página: `Organization`, `WebSite` (con `SearchAction`), `SoftwareApplication`, `FAQPage`, `BreadcrumbList`, `Article` (changelog).
- **OpenGraph + Twitter Card** dinámicos vía `next/og` (`/opengraph-image`, `/twitter-image`).
- **`/llms.txt`** (formato [llmstxt.org](https://llmstxt.org)) + **`/llms-full.txt`** (dump markdown completo) para descubrimiento por LLMs.
- **`/.well-known/{mcp.json,ai-plugin.json,security.txt}`** y **`/openapi.json`** para descubrimiento por agentes.
- Marcado HTML semántico con `<html lang="es-AR">`, `<article>`/`<section>`/`<dl>` jerárquicos, `metadataBase`, canonical URLs.

## ☁️ Deploy

### Vercel + Neon (friendly para un click)

1. **Crear un Neon Postgres** (o cualquier Postgres administrado). Usar la cadena de conexión **pooled** para `DATABASE_URL`.
2. **Configurar vars de entorno** en Vercel — mínimo `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`.
3. **`vercel link`** el proyecto localmente para que `VERCEL_OIDC_TOKEN` sea provisionado para las features de IA.
4. **Deployar**. Los deploys de producción corren `prisma migrate deploy` automáticamente (guardado por `VERCEL_ENV` en [`vercel.json`](./vercel.json)). Los deploys de preview nunca tocan la base de datos.

### Self-host

Ada es una app vanilla Next.js + Postgres. Corre en **cualquier cosa** que pueda correr Node 22 + Postgres 14+:

- Docker / docker-compose (se incluye un [`docker-compose.yml`](./docker-compose.yml) de inicio para la base de datos)
- Fly.io, Railway, Render, Coolify, Dokku
- Tu propio VPS

Las integraciones opcionales (Vercel AI Gateway, Blob, Runtime Cache) todas degradan gracefully — sin ellas, la app igual funciona, solo sin features de IA / lookups cacheados.

## 💡 Sobre Ada

Ada es nombrada en honor a **Ada Lovelace** — matemática del siglo XIX que escribió el primer algoritmo de la historia, décadas antes de que existiera una computadora capaz de ejecutarlo. Ella entendió que las máquinas podían hacer más que calcular: podían razonar.

Ada (la app) nace del mismo espíritu: que la inteligencia, bien aplicada, transforma datos crudos en decisiones claras. Tus extractos bancarios son solo números — Ada los convierte en un panorama de tu vida financiera.

Construida por el equipo detrás de [trefolio.com](https://trefolio.com).

## 🤝 Contributing

Las contribuciones son **muy bienvenidas**, especialmente:

- 🌍 **Traducciones** — los prompts del asistente y el copy de la UI están en español rioplatense; inglés / otros dialectos serían enormes.
- 🔌 **Más integraciones bancarias** — cualquier cosa que GoCardless / Plaid / Belvo pueda conectar.
- 📊 **Más tipos de gráficos** en el asistente.
- 🐛 **Reportes de bugs** con pasos para reproducir.
- ⭐ **Una star** si este proyecto te ahorró una noche.

### Loop de desarrollo

```bash
npm install
npm run prisma:migrate
npm run dev          # en una terminal
npm run test:watch   # en otra
```

Antes de abrir un PR:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

CI corre los mismos gates en cada PR ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

### Estilo de código

- **TypeScript en todo.** Sin `any` a menos que puedas defenderlo.
- **Centralizar errores vía `withApi()`.** No hagas catch+rethrow en los handlers.
- **Los comentarios explican el _por qué_, no el _qué_.** El código ya dice qué.
- **Tests para funciones puras.** Cualquier cosa en `src/lib/**/*.ts` que no toque la DB debería tener un unit test.

## 🗺️ Roadmap

- [ ] UI en inglés / multi-locale
- [ ] Importación CSV / OFX (sin banco de terceros requerido)
- [ ] Presupuestos y alertas
- [ ] Multi-moneda (display + conversión)
- [ ] Captura de voz nativa en mobile
- [ ] Conectores Plaid / Belvo
- [ ] Landing pública + demo

¿Tenés una idea? [Abrí un issue](https://github.com/kyberis/etracker/issues/new) — incluso las a medio formar son útiles.

## 🔐 Notas de auth

- La estrategia es `jwt` (NextAuth `session.strategy === "jwt"`). Las tablas `Session` y `VerificationToken` son eliminadas por la migración `20260428220000_drop_unused_authjs_tables` porque nunca se leen con esta estrategia.
- El adaptador Prisma se **mantiene** porque persiste las filas `User` y `Account` en el primer Google sign-in.
- Google sign-in es **denegación por defecto** cuando `email_verified` no es explícitamente `true`.

## 💾 Capas de caché

- **Vercel Runtime Cache** ([`src/lib/cache/banks.ts`](src/lib/cache/banks.ts)) — lista de bancos por usuario, eviccionada por tag en crear / actualizar / eliminar.
- **Vercel Runtime Cache** ([`src/lib/year-timeline-data.ts`](src/lib/year-timeline-data.ts)) — timeline anual por usuario/año, eviccionado desde cualquier handler que mute un mes.

Ambos hacen fallthrough a queries directas a la DB cuando corren fuera de una función Vercel.

## 🙏 Créditos

Parado sobre los hombros de gigantes:

- [Next.js](https://nextjs.org) · [React](https://react.dev) · [Vercel](https://vercel.com) · [Vercel AI SDK](https://sdk.vercel.ai)
- [Prisma](https://www.prisma.io) · [PostgreSQL](https://www.postgresql.org)
- [Tailwind CSS](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) · [Lucide](https://lucide.dev) · [Base UI](https://base-ui.com)
- [NextAuth.js](https://next-auth.js.org) · [Zod](https://zod.dev)
- [GoCardless Bank Account Data](https://gocardless.com/bank-account-data/) · [Twilio](https://www.twilio.com) · [OpenAI](https://openai.com)
- [Upstash](https://upstash.com) · [Vitest](https://vitest.dev)

## 📄 Licencia

[MIT](./LICENSE) — hacé lo que quieras, solo no nos culpes si tu contador se enoja.

---

<div align="center">

### ¿Te sirvió Ada?

**[⭐ Dale una star en GitHub](https://github.com/kyberis/etracker)** — es la forma más barata de apoyar el proyecto.

**[🐦 Contale a alguien](https://twitter.com/intent/tweet?text=Conocé%20Ada%20—%20asistente%20financiera%20open-source%20con%20IA&url=https%3A%2F%2Fgithub.com%2Fkyberis%2Fetracker)** · **[🐛 Reportar un bug](https://github.com/kyberis/etracker/issues/new)** · **[💬 Abrir una idea](https://github.com/kyberis/etracker/discussions)**

_Hecho con ☕ y una sana desconfianza de las planillas._

Made by [trefolio.com](https://trefolio.com)

</div>
