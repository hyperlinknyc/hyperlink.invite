import { ImageResponse } from 'next/og';
import { DEFAULTS } from '@/lib/defaults';

/**
 * The link preview card.
 *
 * This is the single highest-leverage thing on the whole invite flow. The
 * message arrives as a bare link plus a six-character code, which is the exact
 * shape of a phishing text — and with no og:image, iMessage renders an empty
 * grey rectangle, which makes it look worse. Most people decide whether to tap
 * from this card alone, before they ever reach the terminal.
 *
 * So the card does the reassuring that the terminal deliberately refuses to do:
 * it shows the mark, says the word "party" in plain language, and names the
 * neighbourhood. The date and the address are still withheld — that is the
 * payoff for actually opening the link, and it stays intact.
 */
export const runtime = 'edge';
export const alt = 'HYPERLINK — an invite-only party';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  const green = '#3ee63e';
  const text = '#e6e6e3';
  const dim = '#82827e';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#08090b',
          fontFamily: 'monospace',
          position: 'relative',
        }}
      >
        {/* The chain mark, using the exact paths from components/Logo.tsx.
            Built from two plain rounded rects it came out looking like a pair
            of spectacles — the links have to be OPEN toward the middle and
            bridged, which is what these paths do. */}
        <svg width={318} height={191} viewBox="0 0 200 120" fill="none" style={{ marginBottom: 26 }}>
          <g stroke={green} strokeWidth={14} strokeLinecap="butt" strokeLinejoin="round">
            <path d="M86 25 H58 A25 25 0 0 0 33 50 V70 A25 25 0 0 0 58 95 H86" />
            <path d="M114 25 H142 A25 25 0 0 1 167 50 V70 A25 25 0 0 1 142 95 H114" />
            <path d="M79 60 H121" />
          </g>
        </svg>

        <div
          style={{
            display: 'flex',
            fontSize: 64,
            letterSpacing: 15,
            color: text,
            fontWeight: 700,
          }}
        >
          HYPERLINK
        </div>

        {/* "An invite-only party. You've been invited." said the same thing
            twice. The card only has to do one job — establish that this is a
            real party and not a credential page — so it states that once and
            gets out of the way. */}
        <div style={{ display: 'flex', fontSize: 30, color: text, marginTop: 20 }}>
          An invite-only party.
        </div>

        <div style={{ display: 'flex', fontSize: 23, color: dim, marginTop: 14, letterSpacing: 3 }}>
          {DEFAULTS.hood} · {DEFAULTS.capacity} PEOPLE
        </div>

        <div
          style={{
            display: 'flex',
            position: 'absolute',
            bottom: 34,
            fontSize: 21,
            color: dim,
            letterSpacing: 4,
          }}
        >
          ONE CODE · ONE PERSON · ONE USE
        </div>
      </div>
    ),
    size
  );
}
