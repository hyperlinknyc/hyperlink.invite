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
  world: number;
  invitee_phone: string | null;
  passphrase: string | null;
  sms_status: string | null;
  created_at: string;
  decided_at: string | null;
};

type Counts = {
  accepted: number;
  declined: number;
  pending: number;
  dead: number;
  capacity: number;
  remaining: number;
};

type Settings = {
  edition: string;
  eventDate: string;
  eventTime: string;
  hood: string;
  igHandle: string;
  igUrl: string;
  capacity: number;
  demoCapacity: number;
};

type State = {
  counts: Counts;
  demoCounts: Counts;
  settings: Settings;
  codes: CodeRow[];
  demoCodes: CodeRow[];
  emails: string[];
};

const GLYPH: Record<CodeRow['status'], string> = {
  unused: '·',
  accepted: '■',
  declined: '✗',
  dead: '†',
};

const FIELDS: { key: keyof Settings; label: string; hint?: string }[] = [
  { key: 'edition', label: 'EDITION   ', hint: 'e.g. EDITION 004' },
  { key: 'eventDate', label: 'DATE      ', hint: 'e.g. SAT 11.15' },
  { key: 'eventTime', label: 'TIME      ', hint: 'e.g. 22:00 — 04:00' },
  { key: 'hood', label: 'NEIGHBORHD', hint: 'shown instead of the address' },
  { key: 'igHandle', label: 'IG HANDLE ', hint: 'e.g. @hyperlink_nyc' },
  { key: 'igUrl', label: 'IG URL    ', hint: 'https://instagram.com/...' },
  { key: 'capacity', label: 'CAPACITY  ', hint: 'live party cap' },
  { key: 'demoCapacity', label: 'DEMO CAP  ', hint: 'small = fills fast' },
];

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--green-faint)',
  outline: 'none',
  color: 'var(--green)',
  font: 'inherit',
  textShadow: 'inherit',
  minWidth: 0,
  flex: '1 1 12em',
  padding: '1px 2px',
};

export default function Admin() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [state, setState] = useState<State | null>(null);
  const [msg, setMsg] = useState('');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const dirtyRef = useRef(false);

  const refresh = useCallback(async () => {
    const r = await fetch('/api/admin/state');
    if (r.status === 401) {
      setAuthed(false);
      return;
    }
    const data: State = await r.json();
    setState(data);
    // Don't clobber half-typed settings on the 15s auto-refresh.
    if (!dirtyRef.current) setDraft(data.settings);
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

  async function generate(demo = false) {
    const res = await post('/api/admin/generate', { n: 1, demo });
    setMsg(
      res.codes
        ? `MINTED ${demo ? 'DEMO' : 'SEED'} CODE: ${res.codes.join(' ')}`
        : 'MINT FAILED'
    );
    refresh();
  }

  async function kill(code: string) {
    if (!window.confirm(`KILL ${code}? THIS CANNOT BE UNDONE.`)) return;
    const res = await post('/api/admin/kill', { code });
    setMsg(res.killed ? `KILLED ${code}` : `${code} WAS NOT KILLABLE (not unused)`);
    refresh();
  }

  async function unbind(code: string) {
    if (
      !window.confirm(
        `Unbind ${code} from its number? Use this only if the number was ` +
          `typed wrong — the invite becomes openable by anyone with the link ` +
          `until it is aimed again.`
      )
    )
      return;
    const res = await post('/api/admin/unbind', { code });
    setMsg(res.cleared ? `${code} UNBOUND — can be re-aimed.` : `${code} NOT UNBINDABLE`);
    refresh();
  }

  async function purgeDemo() {
    if (!window.confirm('Wipe ALL demo codes and reset the demo counter?')) return;
    const res = await post('/api/admin/demo-purge', {});
    setMsg(`DEMO WORLD PURGED — ${res.removed} codes removed.`);
    refresh();
  }

  async function saveSettings() {
    if (!draft) return;
    const res = await post('/api/admin/settings', draft);
    if (res.ok) {
      dirtyRef.current = false;
      setMsg('SETTINGS SAVED. LIVE IMMEDIATELY — NO REDEPLOY NEEDED.');
      refresh();
    } else {
      setMsg(`REJECTED: ${res.error ?? 'unknown error'}`);
    }
  }

  async function copyEmails() {
    if (!state?.emails.length) return;
    try {
      await navigator.clipboard.writeText(state.emails.join('\n'));
      setMsg(`COPIED ${state.emails.length} EMAILS.`);
    } catch {
      setMsg('CLIPBOARD REFUSED — use EXPORT CSV.');
    }
  }

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
          <span>
            {GLYPH[node.status]} {node.code}
          </span>
          <span className={node.status === 'accepted' ? '' : 'dim'}>
            {' '}
            {node.status.toUpperCase()}
            {pos}
            {node.email ? ` ${node.email}` : ''}
          </span>
          {node.invitee_phone && (
            <span className="dim">
              {' → '}
              {node.invitee_phone}
              {node.sms_status ? ` [${node.sms_status.toUpperCase()}]` : ''}
              {node.passphrase ? ` "${node.passphrase}"` : ''}
            </span>
          )}
          {node.status === 'unused' && (
            <>
              {' '}
              <span className="act" onClick={() => kill(node.code)}>
                [KILL]
              </span>
              {node.invitee_phone && (
                <>
                  {' '}
                  <span className="act" onClick={() => unbind(node.code)}>
                    [UNBIND]
                  </span>
                </>
              )}
            </>
          )}
        </div>
      );
      const kids = byIssuer.get(node.id) ?? [];
      kids.forEach((kid, i) =>
        walk(
          kid,
          isRoot ? '' : prefix + (isLast ? '   ' : '│  '),
          i === kids.length - 1,
          false
        )
      );
    };
    const roots = byIssuer.get(null) ?? [];
    roots.forEach((r, i) => walk(r, '', i === roots.length - 1, true));
    return out;
  }

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
              style={{ ...inputStyle, borderBottom: 'none', width: '14em' }}
            />
          </div>
          {err && <div className="line warn">{err}</div>}
        </div>
      </div>
    );
  }

  const c = state?.counts;
  const d = state?.demoCounts;

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
          <span className="act" onClick={() => generate(false)}>
            [+ MINT SEED CODE]
          </span>{' '}
          <span className="act" onClick={copyEmails}>
            [COPY ALL EMAILS]
          </span>{' '}
          <a className="act" href="/api/admin/export" style={{ textDecoration: 'none' }}>
            [EXPORT CSV]
          </a>{' '}
          <span className="act" onClick={refresh}>
            [REFRESH]
          </span>
        </div>
        {msg && <div className="line warn">{msg}</div>}

        {/* ── EVENT SETTINGS ─────────────────────────────────────── */}
        <div className="admin-block">
          <div className="line dim">── EVENT SETTINGS ───────────────────</div>
          <div className="line dim">
            Edit and save. Takes effect immediately for everyone — no redeploy.
          </div>
          {draft &&
            FIELDS.map((f) => (
              <div
                className="line"
                key={f.key}
                style={{ display: 'flex', gap: '0.5em', alignItems: 'baseline' }}
              >
                <span style={{ whiteSpace: 'pre' }}>{f.label} </span>
                <input
                  style={inputStyle}
                  value={String(draft[f.key] ?? '')}
                  inputMode={
                    f.key === 'capacity' || f.key === 'demoCapacity' ? 'numeric' : 'text'
                  }
                  onChange={(e) => {
                    dirtyRef.current = true;
                    setDraft({ ...draft, [f.key]: e.target.value });
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && saveSettings()}
                />
                <span className="dim" style={{ flex: '0 0 auto' }}>
                  {f.hint}
                </span>
              </div>
            ))}
          <div className="line">
            <span className="act" onClick={saveSettings}>
              [SAVE SETTINGS]
            </span>{' '}
            <span
              className="act"
              onClick={() => {
                dirtyRef.current = false;
                setDraft(state?.settings ?? null);
                setMsg('REVERTED.');
              }}
            >
              [REVERT]
            </span>
          </div>
        </div>

        {/* ── INVITE CHAIN ───────────────────────────────────────── */}
        <div className="admin-block">
          <div className="line dim">── INVITE CHAIN ─────────────────────</div>
          {state && state.codes.length > 0 ? (
            renderTree(state.codes)
          ) : (
            <div className="line dim">NO CODES YET. MINT A SEED.</div>
          )}
        </div>

        {/* ── DEMO WORLD ─────────────────────────────────────────── */}
        <div className="admin-block">
          <div className="line dim">
            ── DEMO WORLD ───────────────────────{' '}
            <span className="act" onClick={() => setShowDemo(!showDemo)}>
              [{showDemo ? 'HIDE' : 'SHOW'}]
            </span>
          </div>
          {showDemo && (
            <>
              <div className="line dim">
                A full copy of the party mechanics with its own counter. Demo
                codes run the real flow but never touch the guest list, emails,
                or CSV export.
              </div>
              {d && (
                <div className="line">
                  DEMO ACCEPTED {d.accepted}/{d.capacity} · REMAINING {d.remaining} ·
                  PENDING {d.pending} · DECLINED {d.declined} · DEAD {d.dead}
                </div>
              )}
              <div className="line">
                <span className="act" onClick={() => generate(true)}>
                  [+ MINT DEMO CODE]
                </span>{' '}
                <span className="act" onClick={purgeDemo}>
                  [PURGE DEMO WORLD]
                </span>
              </div>
              {state && state.demoCodes.length > 0 ? (
                renderTree(state.demoCodes)
              ) : (
                <div className="line dim">
                  NO DEMO CODES. MINT ONE AND OPEN IT ON THE MAIN SITE.
                </div>
              )}
            </>
          )}
        </div>

        {/* ── EMAILS ─────────────────────────────────────────────── */}
        <div className="admin-block">
          <div className="line dim">
            ── EMAILS ({state?.emails.length ?? 0}) ─────────────
          </div>
          {state?.emails.map((e, i) => (
            <div className="line" key={i}>
              {e}
            </div>
          ))}
        </div>

        <div className="line dim">AUTO-REFRESH 15S</div>
      </div>
    </div>
  );
}
