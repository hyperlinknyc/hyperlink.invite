'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type CodeRow = {
  id: number;
  code: string;
  status: 'unused' | 'accepted' | 'declined' | 'dead';
  issuer_id: number | null;
  email: string | null;
  depth: number;
  position: number | null;
  created_at: string;
  decided_at: string | null;
};

type State = {
  counts: {
    accepted: number;
    declined: number;
    pending: number;
    dead: number;
    capacity: number;
    remaining: number;
  };
  codes: CodeRow[];
  emails: string[];
};

const GLYPH: Record<CodeRow['status'], string> = {
  unused: '·',
  accepted: '■',
  declined: '✗',
  dead: '†',
};

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [state, setState] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/state');
    if (r.status === 401) {
      setAuthed(false);
      return;
    }
    const data = await r.json();
    setState(data);
    setAuthed(true);
  }, []);

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 15000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [refresh]);

  async function login() {
    setErr('');
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    if (r.ok) {
      setPw('');
      refresh();
    } else {
      setErr(r.status === 429 ? 'RATE LIMITED. WAIT.' : 'ACCESS DENIED.');
    }
  }

  async function post(path: string, body: unknown) {
    const r = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.json();
  }

  async function generate() {
    const res = await post('/api/admin/generate', { n: 1 });
    setMsg(res.codes ? `MINTED SEED CODE: ${res.codes.join(' ')}` : 'MINT FAILED');
    refresh();
  }

  async function kill(code: string) {
    if (!window.confirm(`KILL ${code}? THIS CANNOT BE UNDONE.`)) return;
    const res = await post('/api/admin/kill', { code });
    setMsg(res.killed ? `KILLED ${code}` : `${code} WAS NOT KILLABLE (not unused)`);
    refresh();
  }

  async function copyEmails() {
    if (!state?.emails.length) return;
    try {
      await navigator.clipboard.writeText(state.emails.join('\n'));
      setMsg(`COPIED ${state.emails.length} EMAILS.`);
    } catch {
      setMsg('COPY FAILED — use EXPORT CSV.');
    }
  }

  // ── render helpers ─────────────────────────────────────────────
  function renderTree(codes: CodeRow[]) {
    const byIssuer = new Map<number | null, CodeRow[]>();
    for (const c of codes) {
      const k = c.issuer_id;
      if (!byIssuer.has(k)) byIssuer.set(k, []);
      byIssuer.get(k)!.push(c);
    }
    const out: React.ReactNode[] = [];
    const walk = (node: CodeRow, prefix: string, isLast: boolean, isRoot: boolean) => {
      const branch = isRoot ? '' : prefix + (isLast ? '└─ ' : '├─ ');
      const pos =
        node.position != null ? ` #${String(node.position).padStart(2, '0')}` : '';
      out.push(
        <div className="line" key={node.id}>
          <span className="dim">{branch}</span>
          <span>{GLYPH[node.status]} {node.code}</span>
          <span className={node.status === 'accepted' ? '' : 'dim'}>
            {' '}{node.status.toUpperCase()}{pos}
            {node.email ? ` ${node.email}` : ''}
          </span>
          {node.status === 'unused' && (
            <>
              {' '}
              <span className="act" onClick={() => kill(node.code)}>
                [KILL]
              </span>
            </>
          )}
        </div>
      );
      const kids = byIssuer.get(node.id) ?? [];
      kids.forEach((kid, i) =>
        walk(kid, isRoot ? '' : prefix + (isLast ? '   ' : '│  '), i === kids.length - 1, false)
      );
    };
    const roots = byIssuer.get(null) ?? [];
    roots.forEach((r, i) => walk(r, '', i === roots.length - 1, true));
    return out;
  }

  // ── screens ────────────────────────────────────────────────────
  if (authed === null) {
    return (
      <div className="crt">
        <div className="log">
          <div className="line dim">CONNECTING ...</div>
        </div>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="crt">
        <div className="log">
          <div className="line">HYPERLINK CONTROL NODE</div>
          <div className="line dim">OPERATOR ACCESS ONLY.</div>
          <div className="line">&nbsp;</div>
          <div className="line">
            <span>PASSWORD &gt; </span>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && login()}
              autoFocus
              style={{
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--green)',
                font: 'inherit',
                textShadow: 'inherit',
                width: '14em',
              }}
            />
          </div>
          {err && <div className="line warn">{err}</div>}
        </div>
      </div>
    );
  }

  const c = state?.counts;
  return (
    <div className="crt">
      <div className="log">
        <div className="line">HYPERLINK CONTROL NODE // LIVE</div>
        {c && (
          <div className="admin-block">
            <div className="line">
              ACCEPTED {c.accepted}/{c.capacity} · REMAINING {c.remaining} · PENDING{' '}
              {c.pending} · DECLINED {c.declined} · DEAD {c.dead}
            </div>
          </div>
        )}
        <div className="admin-block">
          <span className="act" onClick={generate}>[+ MINT SEED CODE]</span>{' '}
          <span className="act" onClick={copyEmails}>[COPY ALL EMAILS]</span>{' '}
          <a className="act" href="/api/admin/export" style={{ textDecoration: 'none' }}>
            [EXPORT CSV]
          </a>{' '}
          <span className="act" onClick={refresh}>[REFRESH]</span>
        </div>
        {msg && <div className="line warn">{msg}</div>}

        <div className="admin-block">
          <div className="line dim">── INVITE CHAIN ─────────────────────</div>
          {state && state.codes.length > 0 ? (
            renderTree(state.codes)
          ) : (
            <div className="line dim">NO CODES YET. MINT A SEED.</div>
          )}
        </div>

        <div className="admin-block">
          <div className="line dim">── EMAILS ({state?.emails.length ?? 0}) ─────────────</div>
          {state?.emails.map((e, i) => (
            <div className="line" key={i}>{e}</div>
          ))}
        </div>

        <div className="line dim">AUTO-REFRESH 15S · {new Date().toLocaleTimeString()}</div>
      </div>
    </div>
  );
}
