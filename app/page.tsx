'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BLANK,
  L,
  Line,
  Screen,
  useTypewriter,
} from '@/components/Terminal';
import {
  EVENT_DATE,
  EVENT_EDITION,
  EVENT_HOOD,
  EVENT_NAME,
  EVENT_TIME,
  IG_HANDLE,
  IG_URL,
} from '@/lib/config';

type Phase = 'boot' | 'code' | 'decision' | 'confirmDecline' | 'email' | 'end';

type Session = {
  code: string;
  email: string;
  position: number;
  capacity: number;
  childCode: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const DENIALS = [
  'ACCESS DENIED.',
  'ACCESS DENIED. THE NODE REMEMBERS.',
  'ACCESS DENIED. THIS ATTEMPT HAS BEEN LOGGED.',
];

// Shown when the backend is unreachable — never blame the guest's code.
const FAULT_LINES: Line[] = [
  L('CARRIER FAULT. THE NODE DID NOT ANSWER.', 'warn'),
  L('YOUR CODE IS INTACT. WAIT AND TRANSMIT AGAIN.', 'dim'),
];

const BOOT: Line[] = [
  L(`${EVENT_NAME} PRIVATE NODE [BK-03]`),
  L('CARRIER DETECTED ..... 300 BAUD', 'dim'),
  L('HANDSHAKE ............ OK', 'dim'),
  L('ENCRYPTION ........... ACTIVE', 'dim'),
  L('TRACE SUPPRESSION .... ACTIVE', 'dim'),
  BLANK,
  L('UNAUTHORIZED ACCESS IS LOGGED.'),
  L('THIS TERMINAL DOES NOT EXIST.', 'dim'),
  BLANK,
];

const FULL_LINES: Line[] = [
  L('CAPACITY REACHED.', 'warn'),
  L('THE ROOM IS SEALED.'),
  L('ALL OUTSTANDING CODES HAVE BEEN TERMINATED.'),
  BLANK,
  L('// NODE CLOSED', 'dim'),
];

const DEAD_LINES: Line[] = [
  L('KEY REJECTED.', 'warn'),
  L('THIS CODE HAS ALREADY BEEN SPENT — OR BURNED.'),
  L('ONE CODE. ONE HOLDER. ONE CHANCE.'),
  L('THE LINK IS DEAD.', 'dim'),
  BLANK,
];

function boxAround(code: string): Line[] {
  const inner = `   ${code}   `;
  return [
    L(`┌${'─'.repeat(inner.length)}┐`),
    { spans: [{ t: '│' }, { t: inner }, { t: '│' }] },
    L(`└${'─'.repeat(inner.length)}┘`),
  ];
}

function revealLines(spotsRemaining: number, capacity: number): Line[] {
  return [
    L('KEY ACCEPTED. DECRYPTING INVITATION ...', 'dim'),
    BLANK,
    L(`${EVENT_NAME} — ${EVENT_EDITION}`),
    L(`${EVENT_DATE} // ${EVENT_TIME}`),
    L(EVENT_HOOD),
    L('COVER: NONE. BAR: BYOB.'),
    L(`CAPACITY: ${capacity}. SEATS OPEN: ${spotsRemaining}.`),
    L('EXACT LOCATION: TRANSMITTED LATER. KEEP READING.', 'dim'),
    BLANK,
    L('THE RULES:'),
    L('1. THIS CODE ADMITS YOU. ONLY YOU.'),
    L('2. ACCEPT, AND YOU WILL BE ISSUED EXACTLY ONE NEW CODE.'),
    L('   ONE CODE. ONE PERSON. CHOOSE WELL.'),
    L('3. DECLINE, AND THIS CODE DIES. PERMANENTLY.', 'warn'),
    L('   NO REENTRY. NO APPEAL. THE SEAT PASSES TO A STRANGER.', 'warn'),
    BLANK,
    L('THE CHAIN IS THE GUEST LIST. YOU ARE HOLDING A LINK.'),
    BLANK,
    {
      spans: [
        { t: '[ACCEPT]', act: 'accept' },
        { t: '   ' },
        { t: '[DECLINE]', act: 'decline' },
        { t: '   (TYPE OR TAP)', cls: 'dim' },
      ],
    },
  ];
}

const CONFIRM_DECLINE: Line[] = [
  BLANK,
  L('FINAL WARNING.', 'warn'),
  L('DECLINING KILLS THIS CODE. PERMANENTLY.', 'warn'),
  L('THERE IS NO SECOND INVITATION.'),
  {
    spans: [
      { t: 'TYPE DECLINE AGAIN TO CONFIRM — OR ' },
      { t: '[ACCEPT]', act: 'accept' },
      { t: ' TO STEP THROUGH THE DOOR.' },
    ],
  },
];

const DECLINED_LINES: Line[] = [
  BLANK,
  L('UNDERSTOOD.'),
  L('CODE TERMINATED. THE CHAIN CLOSES AROUND THE GAP.'),
  L('FORGET THE DATE. FORGET THE NEIGHBORHOOD.'),
  L('NONE OF THIS WAS REAL.'),
  BLANK,
  L('// CARRIER LOST', 'dim'),
];

function emailPromptLines(): Line[] {
  return [
    BLANK,
    L('COMMITMENT LOGGED. TWO REQUIREMENTS REMAIN.'),
    BLANK,
    {
      spans: [
        { t: '[1] FOLLOW ' },
        { t: IG_HANDLE, href: IG_URL },
        { t: ' ON INSTAGRAM. MANDATORY.' },
      ],
    },
    L('    THE EXACT ADDRESS AND DOOR TIME DROP THROUGH THAT'),
    L("    ACCOUNT'S PRIVATE BROADCAST LIST — NOWHERE ELSE."),
    L('    NO FOLLOW → NO ADDRESS → NO ENTRY.', 'warn'),
    {
      spans: [
        { t: '    ' },
        { t: '>> OPEN INSTAGRAM <<', href: IG_URL },
      ],
    },
    BLANK,
    L('[2] LEAVE A CONTACT ADDRESS. BACKUP CHANNEL ONLY. NO SPAM.'),
    BLANK,
  ];
}

function payoffLines(s: Session, origin: string, restored = false): Line[] {
  const shareUrl = `${origin}/?c=${s.childCode}`;
  const head: Line[] = restored
    ? [
        L('SESSION RESTORED FROM LOCAL BUFFER.', 'dim'),
        BLANK,
        L(`YOU ARE ALREADY IN THE CHAIN, ${s.email}.`),
      ]
    : [L(`${s.email} — VERIFIED.`)];

  const seat: Line[] = [
    L(
      `GUEST ${String(s.position).padStart(2, '0')} OF ${s.capacity}. ` +
        `${Math.max(0, s.capacity - s.position)} SEATS REMAIN BEHIND YOU.`
    ),
    BLANK,
  ];

  if (!s.childCode) {
    return [
      ...head,
      ...seat,
      L('YOU TOOK THE FINAL SEAT.', 'warn'),
      L('THE CHAIN ENDS WITH YOU. NO FURTHER INVITATIONS EXIST.'),
      BLANK,
      L(`REMINDER: THE ADDRESS DROPS VIA ${IG_HANDLE}. BE FOLLOWING.`),
      L(`${EVENT_DATE} // ${EVENT_HOOD} // BYOB`),
      BLANK,
      L('SEE YOU IN THE DARK.'),
      L('// CONNECTION ARCHIVED', 'dim'),
    ];
  }

  return [
    ...head,
    ...seat,
    L('YOU ARE NOW A LINK IN THE CHAIN.'),
    L('YOU ARE OWED EXACTLY ONE INVITATION. IT MINTS NOW:'),
    BLANK,
    ...boxAround(s.childCode),
    BLANK,
    {
      spans: [
        { t: '[COPY CODE]', act: 'copy-code' },
        { t: '  ' },
        { t: '[COPY SHARE LINK]', act: 'copy-link' },
      ],
    },
    L(shareUrl, 'dim'),
    BLANK,
    L('HAND IT TO ONE PERSON. WHEN THEY ACCEPT, THEY MINT THEIR OWN.'),
    L('IF THEY DECLINE, IT DIES WITH THEM.'),
    L('DO NOT POST IT PUBLICLY.', 'warn'),
    BLANK,
    L(`REMINDER: THE ADDRESS DROPS VIA ${IG_HANDLE}. BE FOLLOWING.`),
    L(`${EVENT_DATE} // ${EVENT_HOOD} // BYOB`),
    BLANK,
    L('SEE YOU IN THE DARK.'),
    L('// CONNECTION ARCHIVED', 'dim'),
  ];
}

export default function Home() {
  const { done, current, busy, typeLines, print, skip } = useTypewriter();
  const [phase, setPhaseState] = useState<Phase>('boot');
  const phaseRef = useRef<Phase>('boot');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef('');
  const sessionRef = useRef<Session | null>(null);
  const denialsRef = useRef(0);
  const submittingRef = useRef(false);
  const bootedRef = useRef(false);

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://hyperlink.nyc';

  // ── boot sequence ──────────────────────────────────────────────
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      const statusP = fetch('/api/status').then((r) => r.json()).catch(() => null);
      await typeLines(BOOT);
      const status = await statusP;

      // Returning guest: restore their minted code from this device.
      let saved: Session | null = null;
      try {
        saved = JSON.parse(localStorage.getItem('hl_session') ?? 'null');
      } catch {}
      if (saved?.code) {
        sessionRef.current = saved;
        await typeLines(payoffLines(saved, origin, true));
        setPhase('end');
        return;
      }

      if (status?.full) {
        await typeLines(FULL_LINES);
        setPhase('end');
        return;
      }

      await typeLines([L('ENTER ACCESS CODE')]);
      setPhase('code');

      // Share links arrive as /?c=CODE — auto-type the code for them.
      const c = new URLSearchParams(window.location.search).get('c');
      if (c) {
        const clean = c.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
        for (let i = 1; i <= clean.length; i++) {
          setInput(clean.slice(0, i));
          await new Promise((r) => setTimeout(r, 55));
        }
        await new Promise((r) => setTimeout(r, 350));
        submit(clean);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── submit handlers per phase ──────────────────────────────────
  async function submit(raw: string) {
    if (submittingRef.current) return;
    const value = raw.trim();
    if (!value) return;
    submittingRef.current = true;
    setInput('');
    try {
      const p = phaseRef.current; // ref, not closure state — boot autofill calls this
      if (p === 'code') await submitCode(value);
      else if (p === 'decision') await submitDecision(value);
      else if (p === 'confirmDecline') await submitConfirmDecline(value);
      else if (p === 'email') await submitEmail(value);
    } finally {
      submittingRef.current = false;
    }
  }

  async function submitCode(value: string) {
    print([L(`> ${value.toUpperCase()}`, 'dim')]);
    const res = await api('/api/code', { code: value });
    if (res?.result === 'valid') {
      codeRef.current = res.code;
      await typeLines(revealLines(res.spotsRemaining, res.capacity));
      setPhase('decision');
    } else if (res?.result === 'dead') {
      await typeLines(DEAD_LINES);
      await typeLines([L('ENTER ACCESS CODE')]);
    } else if (res?.result === 'full') {
      await typeLines(FULL_LINES);
      setPhase('end');
    } else if (res?.result === 'ratelimited') {
      await typeLines([
        L('TOO MANY ATTEMPTS. TRACE INITIATED.', 'warn'),
        L('COOL DOWN. TRY AGAIN LATER.', 'dim'),
      ]);
    } else if (res?.result === 'error') {
      await typeLines(FAULT_LINES);
    } else {
      const msg = DENIALS[Math.min(denialsRef.current++, DENIALS.length - 1)];
      await typeLines([L(msg, 'warn'), L('ENTER ACCESS CODE')]);
    }
  }

  async function submitDecision(value: string) {
    const v = value.toUpperCase();
    print([L(`> ${v}`, 'dim')]);
    if (['ACCEPT', 'A', 'YES', 'Y'].includes(v)) {
      await typeLines(emailPromptLines());
      setPhase('email');
    } else if (['DECLINE', 'D', 'NO', 'N'].includes(v)) {
      await typeLines(CONFIRM_DECLINE);
      setPhase('confirmDecline');
    } else {
      await typeLines([L('UNRECOGNIZED. ACCEPT OR DECLINE. THERE IS NO MAYBE.')]);
    }
  }

  async function submitConfirmDecline(value: string) {
    const v = value.toUpperCase();
    print([L(`> ${v}`, 'dim')]);
    if (['ACCEPT', 'A', 'YES', 'Y'].includes(v)) {
      await typeLines([L('RECONSIDERED. WISE.', 'dim')]);
      await typeLines(emailPromptLines());
      setPhase('email');
      return;
    }
    if (['DECLINE', 'D'].includes(v)) {
      const res = await api('/api/decline', { code: codeRef.current });
      if (res?.result === 'error') {
        // Nothing was burned — keep them here rather than dead-ending them.
        await typeLines(FAULT_LINES);
        return;
      }
      await typeLines(res?.result === 'declined' ? DECLINED_LINES : DEAD_LINES);
      setPhase('end');
      return;
    }
    await typeLines([L('TYPE DECLINE TO CONFIRM, OR ACCEPT TO RECONSIDER.')]);
  }

  async function submitEmail(value: string) {
    const email = value.toLowerCase();
    print([L(`> ${email}`, 'dim')]);
    if (!EMAIL_RE.test(email)) {
      await typeLines([L('THAT IS NOT AN ADDRESS. TRY AGAIN.', 'warn')]);
      return;
    }
    await typeLines([L('TRANSMITTING ...', 'dim')]);
    const res = await api('/api/accept', { code: codeRef.current, email });
    if (res?.result === 'accepted') {
      const session: Session = {
        code: codeRef.current,
        email,
        position: res.position,
        capacity: res.capacity,
        childCode: res.childCode,
      };
      sessionRef.current = session;
      try {
        localStorage.setItem('hl_session', JSON.stringify(session));
      } catch {}
      await typeLines(payoffLines(session, origin));
      setPhase('end');
    } else if (res?.result === 'full') {
      await typeLines([
        L('THE LAST SEAT WAS TAKEN WHILE YOU HESITATED.', 'warn'),
        ...FULL_LINES,
      ]);
      setPhase('end');
    } else if (res?.result === 'dead') {
      await typeLines(DEAD_LINES);
      setPhase('end');
    } else if (res?.result === 'bademail') {
      await typeLines([L('THAT IS NOT AN ADDRESS. TRY AGAIN.', 'warn')]);
    } else if (res?.result === 'ratelimited') {
      await typeLines([L('TOO MANY ATTEMPTS. COOL DOWN.', 'warn')]);
    } else {
      // Includes 'error' — stay in the email phase so they can retransmit.
      await typeLines(FAULT_LINES);
    }
  }

  // Returns { result: 'error' } when the node is unreachable or faulting, so
  // an outage never gets mistaken for a rejected code.
  async function api(path: string, body: unknown) {
    try {
      const r = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok && r.status !== 429) return { result: 'error' };
      return await r.json();
    } catch {
      return { result: 'error' };
    }
  }

  // ── tappable [ACTIONS] ─────────────────────────────────────────
  async function onAct(act: string) {
    if (act === 'accept' && (phase === 'decision' || phase === 'confirmDecline')) {
      submit('ACCEPT');
    } else if (act === 'decline' && phase === 'decision') {
      submit('DECLINE');
    } else if (act === 'copy-code' || act === 'copy-link') {
      const s = sessionRef.current;
      if (!s?.childCode) return;
      const text = act === 'copy-code' ? s.childCode : `${origin}/?c=${s.childCode}`;
      try {
        await navigator.clipboard.writeText(text);
        print([L('COPIED TO CLIPBOARD.', 'dim')]);
      } catch {
        // Older in-app browsers (Instagram/Safari) — legacy path.
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          const ok = document.execCommand('copy');
          document.body.removeChild(ta);
          print(
            ok
              ? [L('COPIED TO CLIPBOARD.', 'dim')]
              : [L(`COPY FAILED — WRITE IT DOWN: ${text}`, 'warn')]
          );
        } catch {
          print([L(`COPY FAILED — WRITE IT DOWN: ${text}`, 'warn')]);
        }
      }
    }
  }

  const awaiting =
    !busy && ['code', 'decision', 'confirmDecline', 'email'].includes(phase);
  const prompt = phase === 'email' ? 'EMAIL > ' : '> ';

  return (
    <Screen
      done={done}
      current={current}
      inputLine={awaiting ? { prompt, value: input } : null}
      onAct={onAct}
      onTap={() => {
        skip();
        inputRef.current?.focus();
      }}
    >
      {awaiting && (
        <input
          ref={inputRef}
          className="ghost"
          value={input}
          onChange={(e) =>
            setInput(
              phase === 'email'
                ? e.target.value.replace(/\s/g, '')
                : e.target.value.toUpperCase()
            )
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
          }}
          type={phase === 'email' ? 'email' : 'text'}
          inputMode={phase === 'email' ? 'email' : 'text'}
          autoCapitalize={phase === 'email' ? 'none' : 'characters'}
          autoComplete={phase === 'email' ? 'email' : 'off'}
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus
          aria-label={phase === 'email' ? 'email' : 'access code'}
        />
      )}
    </Screen>
  );
}
