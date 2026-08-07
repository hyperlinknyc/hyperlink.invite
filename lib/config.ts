// ── Event configuration ──────────────────────────────────────────────
// Everything you'd want to tweak before (or during) the party lives here.

// Hard cap on accepted guests. Enforced atomically at the database level.
export const CAPACITY = 40;

// Display strings for the invitation.
export const EVENT_NAME = 'HYPERLINK';
export const EVENT_EDITION = 'EDITION 003';
export const EVENT_DATE = 'FRI 08.22';
export const EVENT_TIME = '21:00 — 00:00';
export const EVENT_HOOD = 'EAST WILLIAMSBURG, BROOKLYN';

// Instagram — the address drops via this account's broadcast list.
export const IG_HANDLE = '@hyperlink_nyc';
export const IG_URL = 'https://instagram.com/hyperlink_nyc';

// Code format: 6 chars from an unambiguous charset (no 0/O, 1/l/I).
export const CODE_LENGTH = 6;
export const CODE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Rate limiting: max attempts per IP per window (guards brute-forcing).
export const RATE_LIMIT_MAX = 12;
export const RATE_LIMIT_WINDOW_MIN = 10;
