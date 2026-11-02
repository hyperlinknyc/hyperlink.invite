'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ChainColor } from '@/lib/config';
import { colorPath, hexToOklch, hexToRgb, oklabDistance, oklchToRgb } from '@/lib/oklch';

/** How long the mark takes to travel from the brand green to a chain colour. */
export const CHAIN_TRANSITION_MS = 1600;

/** How long it stays brand green once it appears, so the guest sees it green
 *  first. Counted in time the page is actually on screen. This plus
 *  CHAIN_TRANSITION_MS is the whole reveal, 2s, and it is also how long a guest
 *  waits for the Instagram link, which prints only after the colour settles. */
export const CHAIN_HOLD_MS = 400;

/** Halo strength while the mark is still green. It is not a link, and bright
 *  green glow beside a green link read as two things to tap, so it waits at a
 *  low glow and powers up to the chain's own as the colour changes. */
const SUBDUED_GLOW = 0.4;

// The halo from .logo in globals.css as [blur px, alpha]. A chain's `glow`
// scales the alphas, so the darker hues can be lifted to read on black.
const HALO = [
  [6, 0.75],
  [18, 0.35],
  [40, 0.18],
] as const;

function paint(el: SVGSVGElement, [r, g, b]: number[], glow: number, bright = 1) {
  el.style.color = `rgb(${r}, ${g}, ${b})`;
  el.style.filter = [
    bright === 1 ? '' : `brightness(${bright.toFixed(3)})`,
    ...HALO.map(
      ([px, a]) =>
        `drop-shadow(0 0 ${px}px rgba(${r}, ${g}, ${b}, ${Math.min(1, a * glow).toFixed(3)}))`
    ),
  ]
    .filter(Boolean)
    .join(' ');
}

// Sine in-out: it never rushes. A cubic spends most of the transition at the
// ends and then changes the colour in a sudden middle moment.
const easeInOut = (t: number) => (1 - Math.cos(Math.PI * t)) / 2;

/**
 * The HYPERLINK mark: two chain links joined by a bar.
 *
 * Drawn as SVG rather than shipped as an image so it stays sharp on every
 * screen, weighs nothing, and takes its colour and glow from CSS. The
 * horizontal banding recreates the scanline texture of the original artwork.
 *
 * Given a chain, it holds the brand green for `hold`, then turns to that
 * chain's colour — once. `animate` false (reduced motion, or a guest coming
 * back to a screen they have already seen) starts it at the final colour with
 * no travel. `onSettled` fires when it reaches the final colour.
 *
 * To use the real PNG instead, drop it at public/logo.png and swap this
 * component's body for <img src="/logo.png" className="logo" alt="" />.
 */
export function Logo({
  chain,
  animate = false,
  hold = CHAIN_HOLD_MS,
  onSettled,
}: {
  chain?: ChainColor;
  animate?: boolean;
  hold?: number;
  onSettled?: () => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;

  // Layout effect, so a mark that starts at its final colour is never
  // painted green for a frame first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !chain) return;
    const finalRgb = hexToRgb(chain.hex);
    const settle = () => {
      paint(el, finalRgb, chain.glow);
      settledRef.current?.();
    };
    const still =
      !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      settle();
      return;
    }

    const brand =
      getComputedStyle(document.documentElement).getPropertyValue('--green').trim() ||
      '#3ee63e';
    const from = hexToOklch(brand);
    const to = hexToOklch(chain.hex);
    // The GREEN chain is the brand colour: no hue to travel, so one
    // brightness pulse over the same span instead.
    const pulse = oklabDistance(from, to) < 0.03;
    const path = colorPath(from, to);
    // Before the first frame, so the mark never shows its full glow for an
    // instant and then drops.
    paint(el, hexToRgb(brand), SUBDUED_GLOW);

    // Time only counts while the page is on screen. Frames stop in a hidden
    // tab, so the first one back reports a huge gap; capping each step keeps a
    // guest who tapped away to Instagram from returning to a finished change.
    let elapsed = 0;
    let last = -1;
    let raf = 0;
    const frame = (now: number) => {
      elapsed += last < 0 ? 0 : Math.min(now - last, 100);
      last = now;
      const t = Math.min(1, Math.max(0, elapsed - hold) / CHAIN_TRANSITION_MS);
      // Still holding: the subdued green painted above stays as it is.
      if (t === 0) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const k = easeInOut(t);
      const glow = SUBDUED_GLOW + (chain.glow - SUBDUED_GLOW) * k;
      if (pulse) {
        // Rises and falls with zero slope at both ends: eased in and out.
        const swell = (1 - Math.cos(2 * Math.PI * t)) / 2;
        paint(el, finalRgb, glow * (1 + 0.9 * swell), 1 + 0.35 * swell);
      } else {
        paint(el, oklchToRgb(path(k)), glow);
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else settle();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [chain, animate, hold]);

  return (
    <div className="logo-wrap" aria-hidden="true">
      <svg
        ref={ref}
        className="logo"
        viewBox="0 0 200 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Scanlines, laid over the strokes only. */}
          <pattern
            id="hl-scan"
            width="4"
            height="4"
            patternUnits="userSpaceOnUse"
          >
            <rect width="4" height="4" fill="white" />
            <rect width="4" height="1.5" y="2.5" fill="black" opacity="0.55" />
          </pattern>
          <mask id="hl-scanmask">
            <rect width="200" height="120" fill="url(#hl-scan)" />
          </mask>
        </defs>

        <g
          mask="url(#hl-scanmask)"
          stroke="currentColor"
          strokeWidth="14"
          strokeLinecap="butt"
          strokeLinejoin="round"
        >
          {/* left link, open toward the middle */}
          <path d="M86 25 H58 A25 25 0 0 0 33 50 V70 A25 25 0 0 0 58 95 H86" />
          {/* right link, mirrored */}
          <path d="M114 25 H142 A25 25 0 0 1 167 50 V70 A25 25 0 0 1 142 95 H114" />
          {/* the bar that makes them one chain */}
          <path d="M79 60 H121" />
        </g>
      </svg>
    </div>
  );
}
