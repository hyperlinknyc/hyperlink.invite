// OKLab / OKLCH conversions (Björn Ottosson's matrices), sRGB in and out.
// Used to move the logo between colours along a path a viewer reads as one
// colour becoming another. Straight RGB goes muddy, and sweeping the hue
// angle shows every colour in between — green to pink passes aqua, blue and
// violet, which reads as three colour changes rather than one.

export type Oklch = { l: number; c: number; h: number };
type Rgb = [number, number, number];

const toLinear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
const toGamma = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.trim().replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function linearToOklab([r, g, b]: Rgb): Rgb {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinear([L, a, b]: Rgb): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function hexToOklch(hex: string): Oklch {
  const [L, a, b] = linearToOklab(
    hexToRgb(hex).map((v) => toLinear(v / 255)) as Rgb
  );
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

/** Perceptual distance between two colours (Euclidean in OKLab). */
export function oklabDistance(x: Oklch, y: Oklch): number {
  const ax = x.c * Math.cos((x.h * Math.PI) / 180);
  const bx = x.c * Math.sin((x.h * Math.PI) / 180);
  const ay = y.c * Math.cos((y.h * Math.PI) / 180);
  const by = y.c * Math.sin((y.h * Math.PI) / 180);
  return Math.hypot(x.l - y.l, ax - ay, bx - by);
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH to 0–255 sRGB. Out-of-gamut colours lose chroma, not hue, so a
 *  vivid midpoint stays the hue it should be instead of clipping sideways. */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const at = (chroma: number) =>
    oklabToLinear([l, chroma * Math.cos(rad), chroma * Math.sin(rad)]);
  let rgb = at(c);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(at(mid))) lo = mid;
      else hi = mid;
    }
    rgb = at(lo);
  }
  return rgb.map((v) =>
    Math.round(toGamma(Math.min(1, Math.max(0, v))) * 255)
  ) as Rgb;
}

const toLab = ({ l, c, h }: Oklch) => ({
  L: l,
  a: c * Math.cos((h * Math.PI) / 180),
  b: c * Math.sin((h * Math.PI) / 180),
});
const fromLab = (L: number, a: number, b: number): Oklch => {
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
};
const lerp = (x: number, y: number, t: number) => x + (y - x) * t;

/**
 * The path from one colour to another, as t from 0 to 1. Never a hue sweep.
 *
 * A straight line in OKLab is the plainest gradient, and for close colours
 * (green to yellow, to blue) it stays vivid. For colours near opposite — green
 * to pink — the line collapses to a dull tan in the middle, so there the path
 * goes through a pale neutral instead: the first colour drains away, then the
 * second fills in, and no third colour is ever shown. Which one applies is
 * decided from the colours themselves, so a retuned palette still behaves.
 */
export function colorPath(from: Oklch, to: Oklch): (t: number) => Oklch {
  const p = toLab(from);
  const q = toLab(to);
  const straight = (t: number) =>
    fromLab(lerp(p.L, q.L, t), lerp(p.a, q.a, t), lerp(p.b, q.b, t));

  // How far the straight line sags in chroma, against the duller of its ends.
  let lowest = Infinity;
  for (let i = 0; i <= 20; i++) lowest = Math.min(lowest, straight(i / 20).c);
  if (lowest >= 0.6 * Math.min(from.c, to.c)) return straight;

  const mid = Math.max(p.L, q.L) + 0.04;
  return (t) =>
    t < 0.5
      ? fromLab(lerp(p.L, mid, t * 2), lerp(p.a, 0, t * 2), lerp(p.b, 0, t * 2))
      : fromLab(
          lerp(mid, q.L, (t - 0.5) * 2),
          lerp(0, q.a, (t - 0.5) * 2),
          lerp(0, q.b, (t - 0.5) * 2)
        );
}
