'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';

// One visual line of terminal output, built from spans so parts of a line
// can be links or tappable [ACTIONS].
export type Span = { t: string; href?: string; act?: string; cls?: string };
/** `logo: true` renders the mark instead of text — it has no characters, so
 *  it appears at once and takes the paragraph beat that follows a blank. */
export type Line = { spans: Span[]; cls?: string; logo?: boolean };

export const L = (t: string, cls?: string): Line => ({ spans: [{ t }], cls });
export const BLANK: Line = { spans: [{ t: '' }] };
export const LOGO: Line = { spans: [{ t: '' }], logo: true };

export function useTypewriter() {
  const [done, setDone] = useState<Line[]>([]);
  const [current, setCurrent] = useState<{ line: Line; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const skipRef = useRef(false);

  const sleep = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, ms));

  /** Append lines with a typewriter reveal. Resolves when finished. */
  /**
   * Pacing. Characters land quickly — the reveal should feel like a machine
   * printing, not like waiting on someone to type. The rhythm comes instead
   * from a real beat at each blank line, which gives the eye somewhere to
   * rest and lets a paragraph be read before the next one starts.
   */
  const CHAR_MS = 5; // base per character
  const CHAR_JITTER_MS = 7; // keeps it from sounding mechanical
  const LINE_PAUSE_MS = 22; // between lines inside a paragraph
  const PARA_PAUSE_MS = 480; // at a blank line: one paragraph, one breath

  const typeLines = useCallback(async (lines: Line[]) => {
    setBusy(true);
    skipRef.current = false;
    for (const line of lines) {
      const total = line.spans.reduce((a, s) => a + s.t.length, 0);
      if (total > 0 && !skipRef.current) {
        for (let n = 1; n <= total; n++) {
          if (skipRef.current) break;
          setCurrent({ line, n });
          await sleep(CHAR_MS + Math.random() * CHAR_JITTER_MS);
        }
      }
      setCurrent(null);
      setDone((d) => [...d, line]);
      if (!skipRef.current) {
        // A blank line is a paragraph break; hold there, not on every line.
        await sleep(total === 0 ? PARA_PAUSE_MS : LINE_PAUSE_MS);
      }
    }
    setBusy(false);
  }, []);

  /** Append lines instantly (no animation). */
  const print = useCallback((lines: Line[]) => setDone((d) => [...d, ...lines]), []);
  /** Fast-forward the current batch (tap-to-skip). */
  const skip = useCallback(() => {
    skipRef.current = true;
  }, []);

  return { done, current, busy, typeLines, print, skip };
}

function SpanView({ s, onAct }: { s: Span; onAct?: (act: string) => void }) {
  if (s.href) {
    // sms:/tel: must navigate in place. Handing them to a new tab leaves the
    // browser with a blank page it cannot route, and nothing opens at all.
    const external = /^https?:/i.test(s.href);
    return (
      <a
        className={s.cls}
        href={s.href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        onClick={(e) => e.stopPropagation()}
      >
        {s.t}
      </a>
    );
  }
  if (s.act) {
    return (
      <span
        className={`act ${s.cls ?? ''}`}
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          onAct?.(s.act!);
        }}
      >
        {s.t}
      </span>
    );
  }
  return <span className={s.cls}>{s.t}</span>;
}

function LineView({
  line,
  upto,
  cursor,
  onAct,
}: {
  line: Line;
  upto?: number;
  cursor?: boolean;
  onAct?: (act: string) => void;
}) {
  const spans: React.ReactNode[] = [];
  let left = upto ?? Infinity;
  for (let i = 0; i < line.spans.length && left > 0; i++) {
    const s = line.spans[i];
    const t = s.t.slice(0, left);
    left -= t.length;
    spans.push(<SpanView key={i} s={{ ...s, t }} onAct={onAct} />);
  }
  return (
    <div className={`line ${line.cls ?? ''}`}>
      {spans}
      {cursor && <span className="cursor" />}
    </div>
  );
}

export function Screen({
  done,
  current,
  inputLine,
  onAct,
  onTap,
  onSubmit,
  children,
}: {
  done: Line[];
  current: { line: Line; n: number } | null;
  /** When non-null, render an input line: prompt + typed value + cursor. */
  inputLine: { prompt: string; value: string } | null;
  onAct?: (act: string) => void;
  onTap?: () => void;
  /** Tapped confirm. iOS numeric keypads have no return key, so a visible
   *  control is the only way to submit a phone number or the last-4 code. */
  onSubmit?: () => void;
  children?: React.ReactNode;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  // Track the visual viewport so the terminal shrinks above the on-screen
  // keyboard instead of hiding the prompt behind it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => {
      document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, []);

  return (
    <div className="crt" onClick={onTap}>
      <div className="log" ref={logRef}>
        {done.map((line, i) =>
          line.logo ? <Logo key={i} /> : <LineView key={i} line={line} onAct={onAct} />
        )}
        {current && <LineView line={current.line} upto={current.n} cursor />}
        {inputLine && (
          <div className="line">
            <span>{inputLine.prompt}</span>
            <span>{inputLine.value}</span>
            <span className="cursor" />
            {onSubmit && (
              <span
                className="act"
                role="button"
                tabIndex={0}
                // pointerdown + preventDefault keeps focus on the hidden input,
                // so the keyboard does not flap shut on every tap.
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSubmit();
                }}
              >
                {'  [ENTER]'}
              </span>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
