// OKLab / OKLCH conversions (Björn Ottosson's matrices), sRGB in and out.
// Used to move the logo between colours along hue rather than through RGB,
// which goes muddy — green to pink in RGB passes through grey-brown.

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

/**
 * Interpolate in OKLCH. The hue always climbs: from the brand green every
 * palette hue lies upward through cyan and blue, while the short way round to
 * pink would sweep through yellow and amber. An achromatic end (WHITE) has no
 * hue of its own, so it borrows the other end's and only lightness and
 * chroma move.
 */
export function mixOklch(from: Oklch, to: Oklch, t: number): Oklch {
  const grey = 0.02;
  let h1 = from.h;
  let h2 = to.h;
  if (to.c < grey) h2 = h1;
  else if (from.c < grey) h1 = h2;
  if (h2 < h1) h2 += 360;
  return {
    l: from.l + (to.l - from.l) * t,
    c: from.c + (to.c - from.c) * t,
    h: (h1 + (h2 - h1) * t) % 360,
  };
}
