'use client';

import { useLayoutEffect, useRef } from 'react';
import type { ChainColor } from '@/lib/config';
import { hexToOklch, hexToRgb, mixOklch, oklabDistance, oklchToRgb } from '@/lib/oklch';

/** How long the mark takes to travel from the brand green to a chain colour. */
export const CHAIN_TRANSITION_MS = 2500;

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

const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * The HYPERLINK mark: two chain links joined by a bar.
 *
 * Drawn as SVG rather than shipped as an image so it stays sharp on every
 * screen, weighs nothing, and takes its colour and glow from CSS. The
 * horizontal banding recreates the scanline texture of the original artwork.
 *
 * Given a chain, it turns from the brand green to that chain's colour — once.
 * `animate` false (reduced motion, or a guest coming back to a screen they
 * have already seen) starts it at the final colour with no travel.
 *
 * To use the real PNG instead, drop it at public/logo.png and swap this
 * component's body for <img src="/logo.png" className="logo" alt="" />.
 */
export function Logo({ chain, animate = false }: { chain?: ChainColor; animate?: boolean }) {
  const ref = useRef<SVGSVGElement>(null);

  // Layout effect, so a mark that starts at its final colour is never
  // painted green for a frame first.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !chain) return;
    const finalRgb = hexToRgb(chain.hex);
    const settle = () => paint(el, finalRgb, chain.glow);
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

    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      // Elapsed time, not frame count, so a backgrounded tab lands on the
      // final colour when it returns rather than resuming mid-travel.
      const t = Math.min(1, (now - start) / CHAIN_TRANSITION_MS);
      if (pulse) {
        // Rises and falls with zero slope at both ends: eased in and out.
        const swell = (1 - Math.cos(2 * Math.PI * t)) / 2;
        paint(el, finalRgb, chain.glow * (1 + 0.9 * swell), 1 + 0.35 * swell);
      } else {
        const k = easeInOut(t);
        paint(el, oklchToRgb(mixOklch(from, to, k)), 1 + (chain.glow - 1) * k);
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else settle();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [chain, animate]);

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
