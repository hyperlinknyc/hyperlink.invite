// ── Build-time configuration ─────────────────────────────────────────
// Event details (date, time, neighborhood, Instagram, capacity) are NOT
// here — they live in the database and are edited from /admin so the site
// can be reused for the next party without a code change. Their first-run
// seed values are in lib/defaults.ts.
//
// What stays here is the stuff that only changes if the mechanics change.

// Code format: 6 chars from an unambiguous charset (no 0/O, 1/l/I).
export const CODE_LENGTH = 6;
export const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Rate limiting: max attempts per IP per window (guards brute-forcing).
// A single guest costs ~4 requests, and friends share networks — at 12 the
// third person on the same wifi would be locked out mid-invite. 40 leaves
// enumeration hopeless anyway: 31^6 is ~887M codes, so even 5,760 guesses a
// day have a ~1-in-4,000 chance of touching any live code.
export const RATE_LIMIT_MAX = 40;
export const RATE_LIMIT_WINDOW_MIN = 10;

// ── Chain colours ────────────────────────────────────────────────────
// Every seed starts a chain with its own colour and everyone it brings in
// inherits it. The colour is the wristband at the door, so each name must
// match a glow stick or band you can actually buy.
//
// The database stores the NAME. `hex` and `glow` are only how the terminal
// draws it, so tune those freely. Renaming or removing an entry strands any
// chain that already carries the old name, so record the old name in
// CHAIN_RENAMED below and the next boot rewrites the stored rows.
//
// No amber or orange: amber is reserved for peak moments (the warning colour
// in the terminal). YELLOW is a pale lemon, kept greenish so it is not taken
// for that amber. The hues are muted to sit in the grey-green terminal, then
// lifted until each reads on near-black — blue, violet and pink needed it
// most. `glow` scales the logo's halo; 1 is the brand green's.
//
// Kept out of every production client bundle: a chain's colour reaches the
// browser only in the response to a successful accept. (The dev-only
// ?chainPreview imports it, inside a branch the production build strips.)
export type ChainColor = { name: string; hex: string; glow: number };

export const CHAIN_PALETTE: readonly ChainColor[] = [
  { name: 'GREEN', hex: '#3ee63e', glow: 1 }, // the brand green; first seed
  { name: 'BLUE', hex: '#73b6fa', glow: 1.4 },
  { name: 'YELLOW', hex: '#f4ea68', glow: 0.9 },
  { name: 'WHITE', hex: '#e9e8e2', glow: 0.85 },
  { name: 'VIOLET', hex: '#bb9af4', glow: 1.5 },
  { name: 'PINK', hex: '#f496bb', glow: 1.25 },
];

/** Colours that were renamed, old name to new. Chains stored under the old name
 *  are rewritten on boot, but only while the old name is not a palette entry,
 *  so bringing a name back never turns its chains into something else. */
export const CHAIN_RENAMED: Readonly<Record<string, string>> = { CYAN: 'YELLOW' };

export function chainColor(name: string | null | undefined): ChainColor | null {
  return CHAIN_PALETTE.find((c) => c.name === name) ?? null;
}
