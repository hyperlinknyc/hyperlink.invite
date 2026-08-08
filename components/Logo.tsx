/**
 * The HYPERLINK mark: two chain links joined by a bar.
 *
 * Drawn as SVG rather than shipped as an image so it stays sharp on every
 * screen, weighs nothing, and takes its colour and glow from CSS. The
 * horizontal banding recreates the scanline texture of the original artwork.
 *
 * To use the real PNG instead, drop it at public/logo.png and swap this
 * component's body for <img src="/logo.png" className="logo" alt="" />.
 */
export function Logo() {
  return (
    <div className="logo-wrap" aria-hidden="true">
      <svg
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
