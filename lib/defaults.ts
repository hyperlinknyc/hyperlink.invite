// ── Seed values ──────────────────────────────────────────────────────
// These are ONLY used to create the settings row the first time the
// database is initialised. After that, everything here is editable from
// the admin console (/admin → EVENT SETTINGS) and changing this file has
// no effect on a database that already exists.

export const WORLD_LIVE = 1;
export const WORLD_DEMO = 2;

export const DEFAULTS = {
  edition: 'EDITION 003',
  eventDate: 'FRI 08.22',
  eventTime: '21:00 — 00:00',
  hood: 'EAST WILLIAMSBURG, BROOKLYN',
  igHandle: '@hyperlink_nyc',
  igUrl: 'https://instagram.com/hyperlink_nyc',
  capacity: 40,
  // Small on purpose: lets you hit the "room is full" state in a few clicks.
  demoCapacity: 5,
};
