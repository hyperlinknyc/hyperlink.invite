// Mint seed codes (depth 0, no issuer). Usage:
//   npm run seed          -> mints 6 codes
//   npm run seed -- 7     -> mints 7 codes
// Runs against DATABASE_URL if set (production/Neon), otherwise the local
// embedded PGlite database in .data/.

import { mintSeedCode } from '../lib/invites';

const n = Math.min(Math.max(parseInt(process.argv[2] ?? '6', 10) || 6, 1), 20);

(async () => {
  const target = process.env.DATABASE_URL ? 'NEON (production)' : 'local PGlite (.data/)';
  console.log(`minting ${n} seed codes against ${target}\n`);
  for (let i = 0; i < n; i++) {
    console.log(`  SEED ${i + 1}: ${await mintSeedCode()}`);
  }
  console.log('\ndone.');
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
