'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';

// One visual line of terminal output, built from spans so parts of a line
// can be links or tappable [ACTIONS].
export type Span = { t: string; href?: string; act?: string; cls?: string };
export type Line = { spans: Span[]; cls?: string };

export const L = (t: string, cls?: string): Line => ({ spans: [{ t }], cls });
export const BLANK: Line = { spans: [{ t: '' }] };

export function useTypewriter() {
  const [done, setDone] = useState<Line[]>([]);
  const [current, setCurrent] = useState<{ line: Line; n: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const skipRef = useRef(false);

  const sleep = (ms: number) =>
    new Promise<void>((r) => setTimeout(r, ms));

  /** Append lines with a typewriter reveal. Resolves when finished. */
  const typeLines = useCallback(async (lines: Line[]) => {
    setBusy(true);
    skipRef.current = false;
    for (const line of lines) {
      const total = line.spans.reduce((a, s) => a + s.t.length, 0);
      if (total > 0 && !skipRef.current) {
        for (let n = 1; n <= total; n++) {
          if (skipRef.current) break;
          setCurrent({ line, n });
          await sleep(11 + Math.random() * 16);
        }
      }
      setCurrent(null);
      setDone((d) => [...d, line]);
      if (!skipRef.current) await sleep(45);
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
    return (
      <a
        className={s.cls}
        href={s.href}
        target="_blank"
        rel="noopener noreferrer"
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
  children,
}: {
  done: Line[];
  current: { line: Line; n: number } | null;
  /** When non-null, render an input line: prompt + typed value + cursor. */
  inputLine: { prompt: string; value: string } | null;
  onAct?: (act: string) => void;
  onTap?: () => void;
  children?: React.ReactNode;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  });

  return (
    <div className="crt" onClick={onTap}>
      <div className="log" ref={logRef}>
        {done.map((line, i) => (
          <LineView key={i} line={line} onAct={onAct} />
        ))}
        {current && <LineView line={current.line} upto={current.n} cursor />}
        {inputLine && (
          <div className="line">
            <span>{inputLine.prompt}</span>
            <span>{inputLine.value}</span>
            <span className="cursor" />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
