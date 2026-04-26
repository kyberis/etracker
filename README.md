# Planned Expenses Tracker

A Next.js app to plan recurring and one-off monthly expenses, grouped by bank, with per-month paid tracking.

## Features

- Email/password login
- Bank management (create, edit, delete)
- Expense management (create, edit, delete)
- Recurring expenses with start/end month rules
- One-off expenses for a single month
- Monthly dashboard with:
  - Income
  - Planned total
  - Paid total
  - Remaining amount
  - Per-bank subtotals
- Mark expenses as paid/unpaid per month

## Tech stack

- Next.js 16 (App Router, TypeScript)
- Tailwind CSS + shadcn/ui
- NextAuth (credentials)
- Prisma + PostgreSQL

## Local setup

1. Install dependencies

```bash
npm install
```

2. Copy environment variables

```bash
cp .env.example .env
```

3. Start PostgreSQL

```bash
docker compose up -d
```

4. Run migrations

```bash
npm run prisma:migrate
```

5. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Useful scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run start` - run production server
- `npm run lint` - run ESLint
- `npm run format` - run Prettier
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - run development migrations
- `npm run prisma:deploy` - run migrations in production

## Deploy to Vercel + Neon

1. Create a Neon Postgres database.
2. Set environment variables in Vercel:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` (your deployed URL)
   - `NEXTAUTH_SECRET`
3. In Vercel build settings, run migrations before build:

```bash
npm run prisma:deploy && npm run build
```

4. Deploy.
