// Direct SQL against the LIVE party database. Operator tool.
//
// Requires production credentials, which are deliberately not in .env.local —
// pull them first, and delete the file when you're done:
//   vercel env pull .env.production.local --environment=production
//   npx tsx scripts/admin-sql.ts inspect
//   npx tsx scripts/admin-sql.ts reset     ← WIPES ALL CODES + GUESTS
//   rm .env.production.local

import { existsSync, readFileSync } from 'fs';
import { neon } from '@neondatabase/serverless';

const ENV_FILE = '.env.production.local';
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    `DATABASE_URL not set. Run: vercel env pull ${ENV_FILE} --environment=production`
  );
}
const sql = neon(url);

const cmd = process.argv[2] ?? 'inspect';

(async () => {
  console.log(`host: ${new URL(url).host}\n`);

  if (cmd === 'reset') {
    if (process.argv[3] !== '--yes-wipe-everything') {
      console.error(
        'Refusing to wipe. This deletes every code and captured email.\n' +
          'Re-run with: npx tsx scripts/admin-sql.ts reset --yes-wipe-everything'
      );
      process.exit(1);
    }
    await sql.query('TRUNCATE codes, attempts RESTART IDENTITY CASCADE');
    await sql.query('UPDATE event_state SET accepted_count = 0, next_position = 0');
    console.log('RESET: all codes, guests, and attempts wiped.\n');
  }

  const codes = await sql.query(
    'SELECT code, status, email, position FROM codes ORDER BY id'
  );
  const state = await sql.query('SELECT accepted_count FROM event_state WHERE id = 1');
  console.log(`accepted_count: ${state[0]?.accepted_count}`);
  console.log(`codes (${codes.length}):`);
  for (const c of codes) {
    console.log(`  ${c.code}  ${c.status}${c.email ? '  ' + c.email : ''}`);
  }
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
