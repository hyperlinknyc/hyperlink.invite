'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BLANK,
  L,
  Line,
  Screen,
  useTypewriter,
} from '@/components/Terminal';
import { DEFAULTS } from '@/lib/defaults';

const EVENT_NAME = 'HYPERLINK';

type Phase =
  | 'boot'
  | 'code'
  | 'decision'
  | 'confirmDecline'
  | 'name'
  | 'phone'
  | 'verify'
  | 'end';

// Event copy is served by /api/status so it can be changed from the admin
// console without a redeploy. DEFAULTS is only the fallback if that fetch
// fails — the terminal should still read correctly during an outage.
type Settings = {
  edition: string;
  eventDate: string;
  eventTime: string;
  hood: string;
  igHandle: string;
  igUrl: string;
  hasCalendar?: boolean;
};

const FALLBACK: Settings = {
  edition: DEFAULTS.edition,
  eventDate: DEFAULTS.eventDate,
  eventTime: DEFAULTS.eventTime,
  hood: DEFAULTS.hood,
  igHandle: DEFAULTS.igHandle,
  igUrl: DEFAULTS.igUrl,
};

type Session = {
  code: string;
  name: string;
  position: number;
  capacity: number;
  childCode: string | null;
  demo?: boolean;
  settings?: Settings;
  // Set once their one invitation has been pointed at someone.
  inviteSent?: boolean;
  maskedPhone?: string;
  mode?: string;
};


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

const VERIFY_PROMPT: Line[] = [
  BLANK,
  L('THIS INVITATION WAS SENT TO ONE PHONE.'),
  L('ENTER THE LAST 4 DIGITS OF YOUR PHONE NUMBER'),
  L('TO PROVE IT REACHED THE RIGHT PERSON.'),
  L('IT IS NOT YOURS IF YOU CANNOT.', 'dim'),
  BLANK,
];

// Marks a demo run so a sandbox pass is never mistaken for the real thing.
const DEMO_BANNER: Line[] = [
  L('*** SIMULATION — DEMO WORLD. NOT THE REAL GUEST LIST. ***', 'warn'),
  BLANK,
];

function revealLines(
  spotsRemaining: number,
  capacity: number,
  s: Settings,
  demo: boolean
): Line[] {
  return [
    L('KEY ACCEPTED. DECRYPTING INVITATION ...', 'dim'),
    BLANK,
    ...(demo ? DEMO_BANNER : []),
    L(`${EVENT_NAME} — ${s.edition}`),
    L(`${s.eventDate} // ${s.eventTime}`),
    L(s.hood),
    L('COVER: NONE. BAR: BYOB.'),
    L(`CAPACITY: ${capacity}. SEATS OPEN: ${spotsRemaining}.`),
    L('STREET ADDRESS: WITHHELD FOR NOW. KEEP READING.', 'dim'),
    BLANK,
    L('THE RULES:'),
    L('1. THIS CODE ADMITS YOU. ONLY YOU.'),
    L('2. ACCEPT, AND YOU CAN BRING ONE PERSON.'),
    L('   YOU GIVE US THEIR NUMBER, WE PREPARE THE MESSAGE.'),
    L('   PICK THE ONE YOU WANT BESIDE YOU.'),
    L('3. DECLINE, AND THIS CODE DIES. PERMANENTLY.', 'warn'),
    L('   THIS LINK WILL NEVER OPEN AGAIN — NOT FOR YOU,', 'warn'),
    L('   NOT FOR ANYONE. YOUR SEAT GOES BACK IN THE POOL.', 'warn'),
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

/**
 * Name first, deliberately. The Instagram link is the only thing on the whole
 * flow that navigates away, and anyone who taps it mid-accept never comes back
 * to finish — no name, no seat, while believing they are in. So the requirement
 * is stated here in plain text and the tappable link waits until the end, once
 * their place is actually secured.
 */
function namePromptLines(cfg: Settings): Line[] {
  return [
    BLANK,
    L('COMMITMENT LOGGED.'),
    BLANK,
    L('WHAT DO WE CALL YOU?'),
    L('THIS IS THE NAME ON THE DOOR. NOTHING ELSE IS.', 'dim'),
    BLANK,
    L(`(YOU WILL ALSO NEED TO FOLLOW ${cfg.igHandle} — WE WILL`, 'dim'),
    L(' HAND YOU THE LINK ONCE YOU ARE THROUGH.)', 'dim'),
    BLANK,
  ];
}

/** The Instagram requirement, shown only once the guest is safely on the list. */
function instagramBlock(cfg: Settings): Line[] {
  return [
    BLANK,
    {
      spans: [
        { t: 'NOW FOLLOW ' },
        { t: cfg.igHandle, href: cfg.igUrl },
        { t: '. MANDATORY.' },
      ],
    },
    L('THE ACCOUNT IS PRIVATE. REQUEST IT AND WE LET YOU IN.'),
    L('THE STREET IS THE ONE THING WE HOLD BACK — IT GOES UP'),
    L('THERE, SEEN ONLY BY PEOPLE WE APPROVED.'),
    L('NOT FOLLOWING WHEN IT DROPS MEANS NOT KNOWING WHERE.', 'warn'),
    {
      spans: [{ t: '>> OPEN INSTAGRAM <<', href: cfg.igUrl, cls: 'cta' }],
    },
  ];
}

function payoffLines(s: Session, restored = false): Line[] {
  // A restored session replays the copy captured at accept time.
  const cfg = s.settings ?? FALLBACK;
  const head: Line[] = [
    ...(s.demo ? DEMO_BANNER : []),
    ...(restored
      ? [
          L('SESSION RESTORED FROM LOCAL BUFFER.', 'dim'),
          BLANK,
          L(`YOU ARE ALREADY IN THE CHAIN, ${s.name}.`),
        ]
      : [L(`${s.name} — LOGGED.`)]),
  ];

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
      ...instagramBlock(cfg),
      BLANK,
      L(`${cfg.eventDate} // ${cfg.eventTime} // ${cfg.hood} // BYOB`),
      ...(cfg.hasCalendar
      ? [
              {
                spans: [{ t: '>> ADD TO CALENDAR <<', href: '/api/ical', cls: 'cta' }],
              } as Line,
          ]
        : []),
      BLANK,
      L('SEE YOU IN THE DARK.'),
      L('// CONNECTION ARCHIVED', 'dim'),
    ];
  }

  return [
    ...head,
    ...seat,
    L('YOU ARE NOW A LINK IN THE CHAIN.'),
    L('YOU ARE OWED EXACTLY ONE INVITATION.'),
    BLANK,
    L('ONE CODE. ONE PERSON. NAME THEM.'),
    BLANK,
    L('WHOSE NUMBER? WE WILL PREPARE THE MESSAGE FOR THEM.'),
    L('IT IS KEYED TO THAT HANDSET, SO IT ONLY OPENS FOR THEM.', 'dim'),
    ...(hasContactPicker()
      ? [
          BLANK,
          {
            spans: [
              { t: '[PICK FROM CONTACTS]', act: 'pick-contact' },
              { t: '   or type it below', cls: 'dim' },
            ],
          } as Line,
        ]
      : []),
    BLANK,
  ];
}

/** Contact Picker exists on Chrome/Android only; never on iOS Safari. */
function hasContactPicker(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof (navigator as { contacts?: { select?: unknown } }).contacts?.select ===
      'function'
  );
}

// Shown after the invitation has been dispatched.
function sentLines(masked: string, cfg: Settings, mode: string): Line[] {
  return [
    BLANK,
    ...(mode === 'server'
      ? [L(`TRANSMITTED TO ${masked}.`)]
      : [
          L(`MESSAGE READY FOR ${masked}.`),
          L('IT SENDS FROM YOUR PHONE, NOT OURS — SO IT LANDS FROM', 'dim'),
          L('A NUMBER THEY ALREADY KNOW. EDIT IT IF YOU WANT.', 'dim'),
        ]),
    BLANK,
    L('THAT WAS YOUR ONE INVITATION. THERE ARE NO MORE.'),
    BLANK,
    ...instagramBlock(cfg),
    BLANK,
    L(`${cfg.eventDate} // ${cfg.eventTime} // ${cfg.hood} // BYOB`),
    ...(cfg.hasCalendar
      ? [
          {
            spans: [{ t: '>> ADD TO CALENDAR <<', href: '/api/ical', cls: 'cta' }],
          } as Line,
        ]
      : []),

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
  const settingsRef = useRef<Settings>(FALLBACK);
  const demoRef = useRef(false);
  const pendingPhoneRef = useRef('');
  const handoffRef = useRef('');
  const messageRef = useRef('');
  const last4Ref = useRef('');

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
      if (status?.settings) settingsRef.current = status.settings;

      // Returning guest: restore their minted code from this device.
      let saved: Session | null = null;
      try {
        saved = JSON.parse(localStorage.getItem('hl_session') ?? 'null');
      } catch {}
      if (saved?.code) {
        sessionRef.current = saved;
        if (saved.inviteSent) {
          // Already spent their invitation — replay the closing screen.
          await typeLines([
            ...(saved.demo ? DEMO_BANNER : []),
            L('SESSION RESTORED FROM LOCAL BUFFER.', 'dim'),
            BLANK,
            L(`YOU ARE ALREADY IN THE CHAIN, ${saved.name}.`),
            ...sentLines(
              saved.maskedPhone ?? 'YOUR CONTACT',
              saved.settings ?? FALLBACK,
              saved.mode ?? 'handoff'
            ),
          ]);
          setPhase('end');
          return;
        }
        // Accepted but never named anyone — put them back on the phone prompt.
        await typeLines(payoffLines(saved, true));
        setPhase('phone');
        return;
      }

      // Share links arrive as /?c=CODE.
      const c = new URLSearchParams(window.location.search).get('c');

      // Only seal the door for someone arriving empty-handed. A code in hand
      // gets validated on its own terms — that's what keeps demo codes usable
      // after the real party has filled, and a real code still hears 'full'.
      if (status?.full && !c) {
        await typeLines(FULL_LINES);
        setPhase('end');
        return;
      }

      await typeLines([L('ENTER ACCESS CODE')]);
      setPhase('code');

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
      else if (p === 'name') await submitName(value);
      else if (p === 'phone') await submitPhone(value);
      else if (p === 'verify') await submitVerify(value);
    } finally {
      submittingRef.current = false;
    }
  }

  const normalize = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // The last-4 check travels with every code lookup and with the accept,
  // so a forwarded link cannot be redeemed by whoever happens to hold it.
  async function submitCode(value: string) {
    print([L(`> ${value.toUpperCase()}`, 'dim')]);
    const res = await api('/api/code', { code: value, last4: last4Ref.current });
    if (res?.result === 'needverify') {
      codeRef.current = normalize(value);
      await typeLines(VERIFY_PROMPT);
      setPhase('verify');
    } else if (res?.result === 'wrongphone') {
      await typeLines([
        L('THAT IS NOT THE PHONE THIS WAS SENT TO.', 'warn'),
        L('THIS INVITATION BELONGS TO SOMEONE ELSE.', 'dim'),
      ]);
    } else if (res?.result === 'valid') {
      codeRef.current = res.code;
      demoRef.current = !!res.demo;
      await typeLines(
        revealLines(res.spotsRemaining, res.capacity, settingsRef.current, !!res.demo)
      );
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

  async function submitVerify(value: string) {
    const digits = value.replace(/\D/g, '');
    print([L(`> ${digits || value}`, 'dim')]);
    if (digits.length !== 4) {
      await typeLines([
        L('FOUR DIGITS — THE LAST 4 OF YOUR PHONE NUMBER.', 'warn'),
      ]);
      return;
    }
    last4Ref.current = digits;
    await typeLines([L('CHECKING ...', 'dim')]);
    const res = await api('/api/code', { code: codeRef.current, last4: digits });
    if (res?.result === 'valid') {
      demoRef.current = !!res.demo;
      await typeLines(
        revealLines(res.spotsRemaining, res.capacity, settingsRef.current, !!res.demo)
      );
      setPhase('decision');
    } else if (res?.result === 'wrongphone' || res?.result === 'needverify') {
      last4Ref.current = '';
      await typeLines([
        L('THAT IS NOT THE PHONE THIS WAS SENT TO.', 'warn'),
        L('THIS INVITATION BELONGS TO SOMEONE ELSE.', 'dim'),
      ]);
    } else if (res?.result === 'dead') {
      await typeLines(DEAD_LINES);
      setPhase('code');
    } else if (res?.result === 'full') {
      await typeLines(FULL_LINES);
      setPhase('end');
    } else if (res?.result === 'ratelimited') {
      await typeLines([L('TOO MANY ATTEMPTS. COOL DOWN.', 'warn')]);
    } else {
      await typeLines(FAULT_LINES);
    }
  }

  async function submitDecision(value: string) {
    const v = value.toUpperCase();
    print([L(`> ${v}`, 'dim')]);
    if (['ACCEPT', 'A', 'YES', 'Y'].includes(v)) {
      await typeLines(namePromptLines(settingsRef.current));
      setPhase('name');
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
      await typeLines(namePromptLines(settingsRef.current));
      setPhase('name');
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

  function saveSession() {
    const s = sessionRef.current;
    if (!s) return;
    try {
      // A demo run must not overwrite a real guest's saved session.
      if (!s.demo) localStorage.setItem('hl_session', JSON.stringify(s));
    } catch {}
  }

  // ── naming the one person you get to bring ─────────────────────
  async function submitPhone(value: string) {
    print([L(`> ${value}`, 'dim')]);
    const digits = value.replace(/\D/g, '');
    if (digits.length < 10 && !value.trim().startsWith('+')) {
      await typeLines([
        L('THAT IS NOT A NUMBER. TEN DIGITS, OR +COUNTRY CODE.', 'warn'),
      ]);
      return;
    }
    const s = sessionRef.current;
    if (!s?.childCode) return;

    await typeLines([L('PREPARING TRANSMISSION ...', 'dim')]);
    const res = await api('/api/invite', {
      code: s.childCode,
      phone: value.trim(),
    });

    if (res?.result === 'badphone') {
      await typeLines([
        L(`REJECTED: ${String(res.error ?? 'bad number').toUpperCase()}`, 'warn'),
        L('GIVE ME THE NUMBER AGAIN.'),
      ]);
      setPhase('phone');
      return;
    }
    if (res?.result === 'error' || res?.result === 'ratelimited') {
      await typeLines(FAULT_LINES);
      return;
    }
    if (res?.result !== 'sent' && res?.result !== 'handoff' && res?.result !== 'already') {
      await typeLines(DEAD_LINES);
      setPhase('end');
      return;
    }

    s.inviteSent = true;
    s.maskedPhone = res.masked;
    s.mode = res.mode;
    sessionRef.current = s;
    saveSession();

    if (res.result === 'already') {
      await typeLines([L('THAT INVITATION IS ALREADY OUT. IT STANDS.', 'warn')]);
    }
    if (res.fellBack) {
      await typeLines([
        L('OUR TRANSMITTER IS DOWN. ROUTING THROUGH YOUR HANDSET.', 'dim'),
      ]);
    }
    await typeLines(sentLines(res.masked, settingsRef.current, res.mode));

    // Hand the composed message to their own SMS app.
    if (res.handoffLink) {
      handoffRef.current = res.handoffLink;
      messageRef.current = res.message ?? '';
      print([
        {
          spans: [
            { t: '>> OPEN MESSAGES AND SEND <<', href: res.handoffLink, cls: 'cta' },
            { t: '   (tap)', cls: 'dim' },
          ],
        },
        // Some in-app browsers (Instagram, Facebook) refuse sms: links
        // outright. Without a fallback the invitation would dead-end here.
        {
          spans: [
            { t: 'IF NOTHING OPENS: ' , cls: 'dim' },
            { t: '[COPY THE MESSAGE]', act: 'copy-message' },
            { t: ' AND TEXT IT YOURSELF.', cls: 'dim' },
          ],
        },
      ]);
    }
    setPhase('end');
  }

  async function submitName(value: string) {
    const name = value.trim().replace(/\s+/g, ' ');
    print([L(`> ${name}`, 'dim')]);
    if (name.length < 2) {
      await typeLines([L('GIVE ME SOMETHING TO PUT ON THE DOOR.', 'warn')]);
      return;
    }
    if (name.length > 60) {
      await typeLines([L('SHORTER. THIS IS A DOOR LIST, NOT A BIOGRAPHY.', 'warn')]);
      return;
    }
    await typeLines([L('TRANSMITTING ...', 'dim')]);
    const res = await api('/api/accept', {
      code: codeRef.current,
      name,
      last4: last4Ref.current,
    });
    if (res?.result === 'accepted') {
      const session: Session = {
        code: codeRef.current,
        name,
        position: res.position,
        capacity: res.capacity,
        childCode: res.childCode,
        demo: !!res.demo,
        settings: settingsRef.current,
      };
      sessionRef.current = session;
      saveSession();
      await typeLines(payoffLines(session));
      // The final guest gets no child code — payoffLines already closes them
      // out, so there is nobody for them to name.
      setPhase(session.childCode ? 'phone' : 'end');
    } else if (res?.result === 'full') {
      await typeLines([
        L('THE LAST SEAT WAS TAKEN WHILE YOU HESITATED.', 'warn'),
        ...FULL_LINES,
      ]);
      setPhase('end');
    } else if (res?.result === 'dead') {
      await typeLines(DEAD_LINES);
      setPhase('end');
    } else if (res?.result === 'badname') {
      await typeLines([L('GIVE ME SOMETHING TO PUT ON THE DOOR.', 'warn')]);
    } else if (res?.result === 'wrongphone') {
      await typeLines([L('THIS INVITATION BELONGS TO SOMEONE ELSE.', 'warn')]);
      setPhase('end');
    } else if (res?.result === 'ratelimited') {
      await typeLines([L('TOO MANY ATTEMPTS. COOL DOWN.', 'warn')]);
    } else {
      // Includes 'error' — stay on the name prompt so they can retransmit.
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
    } else if (act === 'pick-contact') {
      await pickContact();
    } else if (act === 'copy-message') {
      const text = messageRef.current;
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        print([L('COPIED. PASTE IT INTO A TEXT TO THEM.', 'dim')]);
      } catch {
        // Last resort: put it on screen so it can be selected by hand.
        print([
          L('CLIPBOARD REFUSED. THE MESSAGE:', 'warn'),
          ...text.split('\n').map((line) => L(line, 'dim')),
        ]);
      }
    }
  }

  /**
   * Contact Picker API. Chrome on Android only — Safari and the Instagram
   * in-app browser have no such API, which is most of this audience, so the
   * button only appears when it actually exists and typing is the real path.
   */
  async function pickContact() {
    const nav = navigator as Navigator & {
      contacts?: {
        select: (
          props: string[],
          opts?: { multiple?: boolean }
        ) => Promise<Array<{ tel?: string[]; name?: string[] }>>;
      };
    };
    if (!nav.contacts?.select) return;
    try {
      const picked = await nav.contacts.select(['tel', 'name'], { multiple: false });
      const tel = picked?.[0]?.tel?.[0];
      if (tel) {
        setInput(tel);
        submit(tel);
      }
    } catch {
      /* user dismissed the picker */
    }
  }

  const awaiting =
    !busy &&
    ['code', 'decision', 'confirmDecline', 'name', 'phone', 'verify'].includes(
      phase
    );
  const prompt =
    phase === 'name'
      ? 'NAME > '
      : phase === 'phone'
        ? 'PHONE > '
        : phase === 'verify'
          ? 'LAST 4 OF PHONE > '
          : '> ';

  // Free-text phases must not be force-uppercased.
  const freeText = phase === 'name' || phase === 'phone' || phase === 'verify';
  const inputType = phase === 'phone' || phase === 'verify' ? 'tel' : 'text';

  return (
    <Screen
      done={done}
      current={current}
      inputLine={awaiting ? { prompt, value: input } : null}
      onAct={onAct}
      onSubmit={awaiting ? () => submit(input) : undefined}
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
            setInput(freeText ? e.target.value : e.target.value.toUpperCase())
          }
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(input);
          }}
          type={inputType}
          inputMode={phase === 'phone' || phase === 'verify' ? 'tel' : 'text'}
          autoCapitalize={
            phase === 'name' ? 'words' : freeText ? 'none' : 'characters'
          }
          autoComplete={
            phase === 'name' ? 'name' : phase === 'phone' ? 'tel' : 'off'
          }
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          autoFocus
          aria-label={phase}
        />
      )}
    </Screen>
  );
}
