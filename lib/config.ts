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
export const RATE_LIMIT_MAX = 12;
export const RATE_LIMIT_WINDOW_MIN = 10;
