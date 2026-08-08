'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type CodeRow = {
  id: number;
  code: string;
  status: 'unused' | 'accepted' | 'declined' | 'dead';
  issuer_id: number | null;
  guest_name: string | null;
  guest_phone: string | null;
  invited_name: string | null;
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
  startsAt: string;
  endsAt: string;
  capacity: number;
  demoCapacity: number;
};

type State = {
  counts: Counts;
  demoCounts: Counts;
  settings: Settings;
  codes: CodeRow[];
  demoCodes: CodeRow[];
  guests: {
    position: number | null;
    name: string;
    phone: string;
    code: string;
    invitedAs: string;
  }[];
};

const GLYPH: Record<CodeRow['status'], string> = {
  unused: '·',
  accepted: '■',
  declined: '✗',
  dead: '†',
};

/**
 * 'dead' covers three different events: a guest you removed, a code you
 * killed, and codes retired automatically when the room sealed. Only the
 * first has a name attached, so the tree can tell them apart and say which
 * one happened rather than showing "DEAD" next to a person's name.
 */
function statusLabel(c: CodeRow): string {
  if (c.status !== 'dead') return c.status.toUpperCase();
  return c.guest_name ? 'REMOVED' : 'KILLED';
}

function statusGlyph(c: CodeRow): string {
  if (c.status === 'dead' && c.guest_name) return '⊘';
  return GLYPH[c.status];
}

/**
 * sms_status in plain words. 'handoff' means the message is composed and
 * waiting on a phone to actually send it — the site never sends it for you.
 */
const SMS_LABEL: Record<string, string> = {
  handoff: 'READY TO SEND',
  sent: 'TEXTED',
  failed: 'SEND FAILED',
  pending: 'NOT SENT',
};

const FIELDS: { key: keyof Settings; label: string; hint?: string }[] = [
  { key: 'edition', label: 'EDITION   ', hint: 'e.g. EDITION 004' },
  { key: 'eventDate', label: 'DATE      ', hint: 'e.g. SAT 11.15' },
  { key: 'eventTime', label: 'TIME      ', hint: 'e.g. 22:00 — 04:00' },
  { key: 'hood', label: 'NEIGHBORHD', hint: 'shown instead of the address' },
  { key: 'igHandle', label: 'IG HANDLE ', hint: 'e.g. @hyperlink_nyc' },
  { key: 'igUrl', label: 'IG URL    ', hint: 'https://instagram.com/...' },
  { key: 'startsAt', label: 'CAL START ', hint: '2026-08-22T21:00 (NY time)' },
  { key: 'endsAt', label: 'CAL END   ', hint: 'blank both = no calendar link' },
  { key: 'capacity', label: 'CAPACITY  ', hint: 'live party cap' },
  { key: 'demoCapacity', label: 'DEMO CAP  ', hint: 'small = fills fast' },
];

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid var(--faint)',
  outline: 'none',
  color: 'var(--text)',
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
  // Roots folded shut, by code. Chains get long once the party fills.
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [handoff, setHandoff] = useState<{
    code: string;
    link: string;
    masked: string;
    message: string;
  } | null>(null);
  const handoffRef = useRef<HTMLDivElement>(null);
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

  /** Copy a code (or its link) straight from the tree. */
  async function copyCode(code: string, asLink: boolean) {
    const text = asLink ? `${window.location.origin}/?c=${code}` : code;
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`COPIED: ${text}`);
    } catch {
      setMsg(`CLIPBOARD REFUSED — ${text}`);
    }
  }

  /**
   * Aim an unused code at a phone number. Reuses the same endpoint guests
   * use, so a seed code gets the same last-4 binding an invitee's code has —
   * a screenshotted seed can no longer be redeemed by whoever sees it.
   */
  async function aim(code: string) {
    const phone = window.prompt(
      `Bind ${code} to a phone number?\n\n` +
        `They'll need its last 4 digits to open the invite, so a forwarded ` +
        `screenshot is useless. Leave blank to cancel.`
    );
    if (!phone?.trim()) return;
    const res = await post('/api/invite', { code, phone: phone.trim() });
    if (res.result === 'badphone') {
      setMsg(`REJECTED: ${res.error}`);
      return;
    }
    if (res.result === 'already') {
      setMsg(`${code} IS ALREADY AIMED AT ${res.masked}. UNBIND FIRST.`);
      return;
    }
    if (res.result !== 'handoff' && res.result !== 'sent') {
      setMsg(`FAILED: ${res.result}`);
      return;
    }
    setHandoff({
      code,
      link: res.handoffLink ?? '',
      masked: res.masked,
      message: res.message ?? '',
    });
    // The banner renders above the tree; without this it appears off-screen
    // and reads as nothing having happened.
    setTimeout(() => handoffRef.current?.scrollIntoView({ block: 'center' }), 50);
    setMsg(
      res.result === 'sent'
        ? `TEXTED ${res.masked}.`
        : `${code} BOUND TO ${res.masked}. TAP THE LINK BELOW TO SEND IT.`
    );
    refresh();
  }

  /**
   * Send an aimed code. Uses the OS share sheet first — the same path guests
   * use, and the one confirmed to open Messages and return to the page. The
   * sms: link stays as a fallback for browsers without navigator.share.
   */
  async function sendAimed() {
    if (!handoff) return;
    const nav = navigator as Navigator & {
      share?: (d: { text?: string }) => Promise<void>;
    };
    if (typeof nav.share === 'function' && handoff.message) {
      try {
        await nav.share({ text: handoff.message });
        setMsg(`SENT ${handoff.code}.`);
      } catch {
        setMsg('NOT SENT — SHEET DISMISSED. TAP AGAIN WHEN READY.');
      }
      return;
    }
    if (handoff.link) window.location.href = handoff.link;
  }

  async function unbind(code: string) {
    if (
      !window.confirm(
        `Clear the phone number from ${code}?\n\n` +
          `Use this if you typed the wrong number. Until you aim it at a new ` +
          `one, anybody holding the link can open it — the last-4 check is ` +
          `what normally keeps it to one person.`
      )
    )
      return;
    const res = await post('/api/admin/unbind', { code });
    setMsg(res.cleared ? `${code} UNBOUND — can be re-aimed.` : `${code} NOT UNBINDABLE`);
    refresh();
  }

  /** Remove an accepted guest; their seat returns to the pool. */
  async function revoke(code: string, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from the party?\n\n` +
          `Their seat goes back in the pool and their unused invitation dies. ` +
          `Anyone they already brought in stays. This cannot be undone.`
      )
    )
      return;
    const res = await post('/api/admin/revoke', { code });
    if (!res.ok) {
      setMsg(`COULD NOT REMOVE: ${res.reason}`);
      return;
    }
    setMsg(
      `REMOVED ${res.name}. ${res.remaining} SEATS OPEN.` +
        (res.freedChild ? ` THEIR INVITE ${res.freedChild} WAS KILLED.` : '')
    );
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
    if (!state?.guests.length) return;
    const text = state.guests
      .map((g) => `${String(g.position).padStart(2, '0')}  ${g.name}  ${g.phone}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMsg(`COPIED ${state.guests.length} GUESTS.`);
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

    // Everything hanging off a root, so a folded chain can still report
    // how many people it brought in.
    const branchStats = (root: CodeRow) => {
      let total = 0;
      let accepted = 0;
      const stack = [...(byIssuer.get(root.id) ?? [])];
      while (stack.length) {
        const n = stack.pop()!;
        total++;
        if (n.status === 'accepted') accepted++;
        stack.push(...(byIssuer.get(n.id) ?? []));
      }
      return { total, accepted };
    };

    const out: React.ReactNode[] = [];
    const walk = (node: CodeRow, prefix: string, isLast: boolean, isRoot: boolean) => {
      const branch = isRoot ? '' : prefix + (isLast ? '└─ ' : '├─ ');
      const pos =
        node.position != null ? ` #${String(node.position).padStart(2, '0')}` : '';
      out.push(
        <div className="line" key={node.id}>
          <span className="dim">{branch}</span>
          {isRoot && (byIssuer.get(node.id)?.length ?? 0) > 0 ? (
            <span
              className="act"
              onClick={() => {
                const next = new Set(folded);
                next.has(node.code) ? next.delete(node.code) : next.add(node.code);
                setFolded(next);
              }}
            >
              {folded.has(node.code) ? '[+]' : '[-]'}
            </span>
          ) : (
            isRoot && <span className="dim">{'   '}</span>
          )}
          <span>
            {' '}
            {statusGlyph(node)} {node.code}
          </span>
          <span className={node.status === 'accepted' ? '' : 'dim'}>
            {' '}
            {statusLabel(node)}
            {pos}
            {node.guest_name ? ` ${node.guest_name}` : ''}
          </span>
          {node.invitee_phone && (
            <span className="dim">
              {' → '}
              {node.invitee_phone}
              {node.sms_status
                ? ` [${SMS_LABEL[node.sms_status] ?? node.sms_status.toUpperCase()}]`
                : ''}
              {node.passphrase ? ` "${node.passphrase}"` : ''}
            </span>
          )}
          {node.status === 'unused' && (
            <>
              {' '}
              <span className="act" onClick={() => copyCode(node.code, false)}>
                [COPY]
              </span>{' '}
              <span className="act" onClick={() => copyCode(node.code, true)}>
                [COPY LINK]
              </span>{' '}
              {!node.invitee_phone && (
                <>
                  <span className="act" onClick={() => aim(node.code)}>
                    [AIM AT PHONE]
                  </span>{' '}
                </>
              )}
              <span className="act" onClick={() => kill(node.code)}>
                [KILL]
              </span>
              {node.invited_name && node.status === 'unused' && (
              <span className="dim">{` → ${node.invited_name}`}</span>
            )}
            {node.invitee_phone && (
                <>
                  {' '}
                  <span className="act" onClick={() => unbind(node.code)}>
                    [CLEAR NUMBER]
                  </span>
                </>
              )}
            </>
          )}
        </div>
      );
      const kids = byIssuer.get(node.id) ?? [];
      if (isRoot && folded.has(node.code) && kids.length > 0) {
        const { total, accepted } = branchStats(node);
        out.push(
          <div className="line dim" key={`${node.id}-folded`}>
            {'   └─ '}
            {total} in this chain · {accepted} accepted
          </div>
        );
        return;
      }
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
            [COPY DOOR LIST]
          </span>{' '}
          <a className="act" href="/api/admin/export" style={{ textDecoration: 'none' }}>
            [EXPORT CSV]
          </a>{' '}
          <span className="act" onClick={refresh}>
            [REFRESH]
          </span>
        </div>
        {msg && <div className="line warn">{msg}</div>}
        {handoff?.link && (
          <div className="admin-block" ref={handoffRef}>
            <div className="line">
              <span className="act cta" onClick={sendAimed}>
                &gt;&gt; SEND {handoff.code} TO {handoff.masked} &lt;&lt;
              </span>{' '}
              <span className="act" onClick={() => setHandoff(null)}>
                [DISMISS]
              </span>
            </div>
            <div className="line dim">
              Tap that to pick them in Messages. Aiming only prepares the text —
              nothing is sent until you do. On a computer nothing will open;
              use [COPY LINK] instead.
            </div>
          </div>
        )}

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
          <div className="line dim">
            ── INVITE CHAIN ─────────────────────{' '}
            <span
              className="act"
              onClick={() =>
                setFolded(
                  new Set(
                    (state?.codes ?? [])
                      .filter((c) => c.issuer_id === null)
                      .map((c) => c.code)
                  )
                )
              }
            >
              [COLLAPSE ALL]
            </span>{' '}
            <span className="act" onClick={() => setFolded(new Set())}>
              [EXPAND ALL]
            </span>
          </div>
          <div className="line dim">
            · unused (still works) · ■ accepted · ✗ declined by them ·
            ⊘ removed by you · † killed / retired when full
          </div>
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
                codes run the real flow but never touch the guest list, door list,
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

        {/* ── DOOR LIST ──────────────────────────────────────────── */}
        <div className="admin-block">
          <div className="line dim">
            ── DOOR LIST ({state?.guests.length ?? 0}) ───────────
          </div>
          {state?.guests.length ? (
            state.guests.map((g, i) => (
              <div className="line" key={i}>
                <span className="dim">
                  {String(g.position ?? 0).padStart(2, '0')}{'  '}
                </span>
                <span>{g.name}</span>
                <span className="dim">{g.phone ? `  ${g.phone}` : ''}</span>
                {g.invitedAs &&
                  !g.name.toLowerCase().startsWith(g.invitedAs.toLowerCase()) && (
                    <span className="warn">{`  (invited as ${g.invitedAs})`}</span>
                  )}{' '}
                <span className="act" onClick={() => revoke(g.code, g.name)}>
                  [REMOVE]
                </span>
              </div>
            ))
          ) : (
            <div className="line dim">NOBODY HAS ACCEPTED YET.</div>
          )}
        </div>

        <div className="line dim">AUTO-REFRESH 15S</div>
      </div>
    </div>
  );
}
