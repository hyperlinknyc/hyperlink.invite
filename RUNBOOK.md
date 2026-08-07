# HYPERLINK — party runbook

Plain-English guide for running the invite chain and the night itself.
Everything happens at the admin console:

**https://hyperlink-invite.vercel.app/admin**
(becomes `hyperlink.nyc/admin` once the domain is attached)

The password is in your password manager — it is not in this repo.

## Before you send anything

1. Open `/admin`, log in.
2. Tap `[+ MINT SEED CODE]` 5–7 times. These are your root invites.
3. Send each seed code (or the link `hyperlink.nyc/?c=CODE`) to one
   person each, by DM. One code per person — that's the whole game.

## While the chain grows

- The **INVITE CHAIN** tree shows who invited whom, live
  (■ accepted · × declined · † dead/killed · · unused).
- The counts line is your dashboard: `ACCEPTED n/40 · REMAINING · PENDING
  (codes out in the wild) · DECLINED · DEAD`.
- Someone sketchy holding a code? `[KILL]` next to their unused code
  makes it worthless. Killing can't be undone.
- Chain stalled? Mint another seed code and hand it to a connector.
- Declines are visible in the tree — you'll know who passed.

## Capacity

- Capacity is **40**, set in `lib/config.ts` (`CAPACITY`). Change it,
  commit, push — Vercel redeploys automatically.
- When guest #40 accepts, every unused code dies automatically and the
  site shows a sealed "NODE CLOSED" state to everyone else. Nothing for
  you to do.

## Announcing the address

The site never shows the address. It tells every accepted guest to follow
**@hyperlink_nyc** and that the address drops via that account's broadcast
list. Day-of:

1. `/admin` → `[COPY ALL EMAILS]` (or `[EXPORT CSV]` for a spreadsheet).
2. Post the address + door time to the Instagram broadcast channel.
3. Optionally BCC the email list as backup — that's what it's for.

## Door list

`[EXPORT CSV]` gives you every accepted guest with email, chain position,
and who invited them — sort by `position` and that's your door list.

## If something breaks

- **Site down / weird:** Vercel dashboard → Deployments → redeploy the
  last good build. Data is safe in Neon; deploys don't touch it.
- **Wrong person got in:** you can't un-accept via the UI. Their invite
  (child code) can be `[KILL]`ed to stop their branch.
- **Rate-limit lockout** (someone hammered codes from a shared IP, e.g.
  venue wifi): it clears itself after 10 minutes of quiet.
- **Nuclear reset** (before the party only!) — wipes every code and email:

  ```bash
  vercel env pull .env.production.local --environment=production
  npx tsx scripts/admin-sql.ts reset --yes-wipe-everything
  rm .env.production.local
  ```

  Then mint new seed codes in the admin console.

## What guests see if something goes wrong

Worth knowing so you can answer a confused DM:

- **"CARRIER FAULT. THE NODE DID NOT ANSWER."** — the site couldn't reach
  the database. Their code is untouched and still works. Tell them to wait
  a minute and re-enter it.
- **"KEY REJECTED / THE LINK IS DEAD"** — that code was genuinely used or
  burned already.
- **"CAPACITY REACHED / NODE CLOSED"** — the party is full. Every unused
  code died at that moment.
- **"ACCESS DENIED"** — the code doesn't exist. Usually a typo; the site
  ignores case, spaces, and dashes, so it's a real mismatch.
