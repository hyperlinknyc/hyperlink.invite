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

## Live deployment

| | |
|---|---|
| Site | https://hyperlink-invite.vercel.app |
| Admin | https://hyperlink-invite.vercel.app/admin |
| Vercel project | `hyperlinknyc1/hyperlink-invite` |
| Database | Neon `neon-pink-desert`, attached via Vercel marketplace |

`DATABASE_URL` is injected by the Neon integration — it is not stored in
this repo or in any local file.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000  (admin at /admin)
```

No database setup needed — a local Postgres lives in `.data/` (gitignored).
Delete `.data/` to reset everything.

**Local never touches the live guest list.** `.env.local` deliberately has no
`DATABASE_URL`, so `npm run dev` always uses the isolated local database.
Don't add one; if you need production data, see the operator script below.

Secrets live in `.env.local` (gitignored — see `.env.example`):

| Var | Meaning |
|---|---|
| `ADMIN_PASSWORD` | Password for `/admin` |
| `SESSION_SECRET` | Signs the admin cookie (`openssl rand -hex 32`) |

## Operator script (production data)

```bash
vercel env pull .env.production.local --environment=production
npx tsx scripts/admin-sql.ts inspect     # list every code + guest
rm .env.production.local                 # don't leave creds lying around
```

`reset` wipes every code and captured email; it refuses unless you pass
`--yes-wipe-everything`.

## Configuration

All event knobs are in [lib/config.ts](lib/config.ts): capacity, date/time
strings, neighborhood, Instagram handle, code format, rate limits.

## Seeding codes

- **Admin UI (easiest):** log into `/admin`, tap `[+ MINT SEED CODE]`.
- **CLI:** `npm run seed -- 6` (targets Neon if `DATABASE_URL` is set,
  otherwise the local DB — don't run the CLI locally while `npm run dev`
  is running; PGlite allows one process at a time).

## Redeploying

Pushing to `main` on GitHub auto-deploys. Or from this directory:

```bash
vercel deploy --prod
```

The database schema creates itself on first request — no migration step.

## Attaching the domain (not yet done)

Once `hyperlink.nyc` is registered:

```bash
vercel domains add hyperlink.nyc
```

Vercel prints the DNS record to set at the registrar. Certificates are
automatic. No code change is needed — share links read their origin from
the browser, so they switch to `hyperlink.nyc` on their own.

## Night-of operations

See [RUNBOOK.md](RUNBOOK.md).
