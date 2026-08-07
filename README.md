# hyperlink.nyc

Invite-only event site for HYPERLINK — a terminal-styled, viral-invite-chain
RSVP system. Every accepted guest mints exactly one new invite code.
Capacity is enforced atomically in Postgres.

## How it works

- Guests open a share link (`hyperlink.nyc/?c=CODE`) or type a code.
- Valid code → invitation reveal → ACCEPT or DECLINE (declining burns the code).
- Accepting requires an email + following the Instagram account, then mints
  one fresh code to pass on.
- At capacity (40), all unused codes are killed and the site shows a
  sealed/full state.

## Stack

- **Next.js 15** (App Router, TypeScript) — one deployable unit on Vercel.
- **Postgres** — [Neon](https://neon.tech) free tier in production;
  [PGlite](https://pglite.dev) (embedded Postgres, zero install) locally.
  The same SQL runs in both.
- No ORM. The critical accept path is a single atomic SQL statement
  (`lib/invites.ts`) so double-submits and capacity races can't oversell.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000  (admin at /admin)
```

No database setup needed — a local Postgres lives in `.data/` (gitignored).
Delete `.data/` to reset everything.

Secrets live in `.env.local` (gitignored — see `.env.example`):

| Var | Meaning |
|---|---|
| `ADMIN_PASSWORD` | Password for `/admin` |
| `SESSION_SECRET` | Signs the admin cookie (`openssl rand -hex 32`) |
| `DATABASE_URL` | Neon connection string. **Unset locally** = use PGlite |

## Configuration

All event knobs are in [lib/config.ts](lib/config.ts): capacity, date/time
strings, neighborhood, Instagram handle, code format, rate limits.

## Seeding codes

- **Admin UI (easiest):** log into `/admin`, tap `[+ MINT SEED CODE]`.
- **CLI:** `npm run seed -- 6` (targets Neon if `DATABASE_URL` is set,
  otherwise the local DB — don't run the CLI locally while `npm run dev`
  is running; PGlite allows one process at a time).

## Deploy (Vercel + Neon)

1. Push this repo to GitHub.
2. **Neon:** create a free project → copy the connection string
   (`postgresql://...@...neon.tech/neondb?sslmode=require`).
3. **Vercel:** import the GitHub repo → add env vars `DATABASE_URL`,
   `ADMIN_PASSWORD`, `SESSION_SECRET` → deploy.
4. **Domain:** in Vercel → Project → Settings → Domains, add
   `hyperlink.nyc`, then set the DNS records Vercel shows you at your
   registrar (an `A` record to Vercel's IP, or change nameservers).
5. Open `https://hyperlink.nyc/admin`, log in, mint your seed codes.

The database schema creates itself on first request — no migration step.

## Night-of operations

See [RUNBOOK.md](RUNBOOK.md).
