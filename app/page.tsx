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
  | 'invitee'
  | 'verify'
  | 'claimname'
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
  // Set once their one invitation has been addressed to someone.
  inviteSent?: boolean;
  invitedName?: string;
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
  L('IF YOU CANNOT VALIDATE IT, THIS INVITE IS NOT YOURS.', 'dim'),
  BLANK,
];

const CLAIM_NAME_PROMPT: Line[] = [
  BLANK,
  L('THIS INVITATION HAS A NAME ON IT.'),
  L('TYPE YOUR FIRST NAME TO OPEN IT.'),
  L('WE WILL NOT TELL YOU WHOSE. YOU EITHER KNOW OR YOU DO NOT.', 'dim'),
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
  demo: boolean,
  invitedName?: string | null
): Line[] {
  return [
    L('KEY ACCEPTED. DECRYPTING INVITATION ...', 'dim'),
    BLANK,
    // Named by whoever sent it, so the recipient can tell at a glance
    // whether this was meant for them or reached them by accident.
    ...(invitedName
      ? [L(`WELCOME, ${invitedName.toUpperCase()}.`), BLANK]
      : []),
    ...(demo ? DEMO_BANNER : []),
    L(`${EVENT_NAME} — ${s.edition}`),
    L(`${s.eventDate} // ${s.eventTime}`),
    L(s.hood),
    L('COVER: NONE. BAR: BYOB.'),
    L(`CAPACITY: ${capacity}. SEATS OPEN: ${spotsRemaining}.`),
    L('ADDRESS: WITHHELD FOR NOW. KEEP READING.', 'dim'),
    BLANK,
    L('THE RULES:'),
    L('1. THIS CODE ADMITS YOU. ONLY YOU.'),
    L('2. ACCEPT, AND YOU CAN BRING ONE PERSON.'),
    L('   NAME THEM, THEN SEND IT STRAIGHT FROM YOUR PHONE.'),
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
function namePromptLines(cfg: Settings, invitedName?: string | null): Line[] {
  return [
    BLANK,
    L('COMMITMENT LOGGED.'),
    BLANK,
    // Whoever invited them already typed a first name. Asking for the whole
    // name again wastes the one fact we have — and echoing it back doubles
    // as a quiet check that the invite reached the right person.
    ...(invitedName
      ? [
          L(`${invitedName.toUpperCase()} — AND YOUR LAST NAME?`),
          L('THAT IS THE NAME ON THE DOOR.', 'dim'),
        ]
      : [
          L('WHAT DO WE CALL YOU?'),
          L('THIS IS THE NAME ON THE DOOR. NOTHING ELSE IS.', 'dim'),
        ]),
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
    L('THE ADDRESS IS THE ONLY THING WE HOLD BACK — IT GOES UP'),
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
      ...SIGN_OFF,
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
    L('WHO ARE YOU BRINGING? A FIRST NAME IS ENOUGH.'),
    L('YOU PICK THEM FROM YOUR OWN CONTACTS ON THE NEXT TAP —', 'dim'),
    L('THERE IS NO NUMBER TO LOOK UP.', 'dim'),
    BLANK,
  ];
}

// Shown once the invitation has been addressed. Deliberately ends on the
// send action and nothing else — sending is the only step that grows the
// chain, and intent is highest the second after they name someone.
function sentLines(invitedName: string): Line[] {
  return [
    BLANK,
    L(`INVITATION PREPARED FOR ${invitedName.toUpperCase()}.`),
    L('IT SENDS FROM YOUR OWN PHONE, SO IT LANDS FROM A NUMBER', 'dim'),
    L('THEY ALREADY KNOW. PICK THEM ON THE NEXT SCREEN.', 'dim'),
    BLANK,
  ];
}

/**
 * Everything after the send. Held back until they have actually tapped it,
 * so the screen carries one instruction at a time — and so the Instagram
 * link, the only thing here that leaves the page, comes last.
 */
function afterSendLines(cfg: Settings): Line[] {
  return [
    BLANK,
    L('THAT WAS YOUR ONE INVITATION. THERE ARE NO MORE.'),
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
    ...SIGN_OFF,
  ];
}

/** The last thing on the screen, printed after the send action. */
const SIGN_OFF: Line[] = [
  BLANK,
  L('SEE YOU IN THE DARK.'),
  L('// EVERY LINK LEADS TO ANOTHER', 'dim'),
];

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
  const claimNameRef = useRef('');
  const revealedRef = useRef(false);
  const invitedNameRef = useRef<string | null>(null);
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
            ...sentLines(saved.invitedName ?? 'YOUR GUEST'),
            ...afterSendLines(saved.settings ?? FALLBACK),
          ]);
          setPhase('end');
          return;
        }
        // Accepted but never named anyone — send them back to that prompt.
        await typeLines(payoffLines(saved, true));
        setPhase('invitee');
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
      else if (p === 'invitee') await submitInvitee(value);
      else if (p === 'verify') await submitVerify(value);
      else if (p === 'claimname') await submitClaimName(value);
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
    if (res?.result === 'needname') {
      codeRef.current = normalize(value);
      await typeLines(CLAIM_NAME_PROMPT);
      setPhase('claimname');
    } else if (res?.result === 'wrongname') {
      await typeLines([
        L('THAT IS NOT THE NAME ON THIS INVITATION.', 'warn'),
        L('IT WAS MEANT FOR SOMEONE ELSE.', 'dim'),
      ]);
    } else if (res?.result === 'needverify') {
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
      invitedNameRef.current = res.invitedName ?? null;
      await typeLines(
        revealLines(
          res.spotsRemaining,
          res.capacity,
          settingsRef.current,
          !!res.demo,
          res.invitedName
        )
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
      invitedNameRef.current = res.invitedName ?? null;
      await typeLines(
        revealLines(
          res.spotsRemaining,
          res.capacity,
          settingsRef.current,
          !!res.demo,
          res.invitedName
        )
      );
      setPhase('decision');
    } else if (res?.result === 'needname') {
      await typeLines(CLAIM_NAME_PROMPT);
      setPhase('claimname');
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

  /**
   * The name challenge. Whoever sent this typed a first name; the recipient
   * has to produce it. Deliberately never shown beforehand — displaying it
   * would hand the answer to anyone holding the link.
   */
  async function submitClaimName(value: string) {
    const given = value.trim();
    print([L(`> ${given}`, 'dim')]);
    if (given.length < 1) {
      await typeLines([L('TYPE YOUR FIRST NAME.', 'warn')]);
      return;
    }
    claimNameRef.current = given;
    await typeLines([L('CHECKING ...', 'dim')]);
    const res = await api('/api/code', {
      code: codeRef.current,
      last4: last4Ref.current,
      claimName: given,
    });
    if (res?.result === 'valid') {
      invitedNameRef.current = res.invitedName ?? null;
      demoRef.current = !!res.demo;
      await typeLines(
        revealLines(
          res.spotsRemaining,
          res.capacity,
          settingsRef.current,
          !!res.demo,
          res.invitedName
        )
      );
      setPhase('decision');
    } else if (res?.result === 'wrongname' || res?.result === 'needname') {
      claimNameRef.current = '';
      await typeLines([
        L('THAT IS NOT THE NAME ON THIS INVITATION.', 'warn'),
        L('IT WAS MEANT FOR SOMEONE ELSE.', 'dim'),
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
      await typeLines(namePromptLines(settingsRef.current, invitedNameRef.current));
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
      await typeLines(namePromptLines(settingsRef.current, invitedNameRef.current));
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
  /**
   * No phone number is asked for here on purpose. Nothing on the web can read
   * an iPhone's contacts, so demanding a number sends the inviter out to the
   * Contacts app — the same leak that loses people at the Instagram link.
   * They give a first name instead, and the OS share sheet acts as the contact
   * picker on the next tap.
   */
  async function submitInvitee(value: string) {
    const who = value.trim().replace(/\s+/g, ' ');
    print([L(`> ${who}`, 'dim')]);
    if (who.length < 1) {
      await typeLines([L('GIVE ME A NAME.', 'warn')]);
      return;
    }
    const sess = sessionRef.current;
    if (!sess?.childCode) return;

    await typeLines([L('PREPARING THE INVITATION ...', 'dim')]);
    const res = await api('/api/invite', { code: sess.childCode, name: who });

    if (res?.result === 'error' || res?.result === 'ratelimited') {
      await typeLines(FAULT_LINES);
      return;
    }
    if (res?.result !== 'named') {
      await typeLines(DEAD_LINES);
      setPhase('end');
      return;
    }

    const named = String(res.invitedName ?? who);
    sess.inviteSent = true;
    sess.invitedName = named;
    sessionRef.current = sess;
    saveSession();
    messageRef.current = res.message ?? '';

    if (res.alreadyNamed) {
      await typeLines([
        L(`ALREADY ADDRESSED TO ${named.toUpperCase()}. THAT STANDS.`, 'warn'),
      ]);
    }

    await typeLines(sentLines(named));
    print([
      {
        spans: [
          { t: `>> SEND IT TO ${named.toUpperCase()} <<`, act: 'share', cls: 'cta' },
          { t: '   (tap)', cls: 'dim' },
        ],
      },
      {
        spans: [
          { t: 'OR ', cls: 'dim' },
          { t: '[COPY THE INVITATION]', act: 'copy-message' },
          { t: ' AND SEND IT HOWEVER YOU LIKE.', cls: 'dim' },
        ],
      },
    ]);
    setPhase('end');
  }

  async function submitName(value: string) {
    const typed = value.trim().replace(/\s+/g, ' ');
    print([L(`> ${typed}`, 'dim')]);
    // When the inviter supplied a first name we only asked for the surname,
    // so stitch the two together into the door-list entry.
    const invited = invitedNameRef.current;
    const name = invited ? `${invited} ${typed}`.trim() : typed;
    const floor = invited ? 1 : 2;
    if (typed.length < floor) {
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
      claimName: claimNameRef.current,
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
      setPhase(session.childCode ? 'invitee' : 'end');
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
    } else if (act === 'share') {
      // The OS share sheet IS the contact picker. Nothing on the web can read
      // an iPhone's address book, but the sheet hands the message to Messages
      // or WhatsApp where the user picks the person from their real contacts.
      // It requires a user gesture, so it runs directly off this tap.
      const text = messageRef.current;
      if (!text) return;
      const nav = navigator as Navigator & {
        share?: (d: { text?: string }) => Promise<void>;
      };
      if (typeof nav.share === 'function') {
        try {
          // The link already sits inside `text`; passing `url` as well makes
          // some targets append it a second time.
          await nav.share({ text });
          print([L('SENT.', 'dim')]);
        } catch {
          // Dismissing the sheet lands here too, so stay neutral.
          print([L('NOT SENT YET. TAP AGAIN WHEN READY.', 'dim')]);
        }
        await revealAfterSend();
        return;
      }
      // No share sheet (desktop, some in-app browsers) — fall back to copy.
      await copyInvitation();
      await revealAfterSend();
    } else if (act === 'copy-message') {
      await copyInvitation();
      await revealAfterSend();
    }
  }

  /**
   * The Instagram requirement, date and sign-off, held back until they have
   * dealt with sending. Printed once — the send link stays live for a retry,
   * and tapping it again should not repeat the whole closing screen.
   */
  async function revealAfterSend() {
    if (revealedRef.current) return;
    revealedRef.current = true;
    await typeLines(afterSendLines(settingsRef.current));
  }

  /** Clipboard, with the raw text printed on screen if that is refused too. */
  async function copyInvitation() {
    const text = messageRef.current;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      print([L('COPIED. PASTE IT INTO A MESSAGE TO THEM.', 'dim')]);
    } catch {
      print([
        L('CLIPBOARD REFUSED. SEND THIS BY HAND:', 'warn'),
        ...text.split('\n').map((line) => L(line, 'dim')),
      ]);
    }
  }

  const awaiting =
    !busy &&
    [
      'code',
      'decision',
      'confirmDecline',
      'name',
      'invitee',
      'verify',
      'claimname',
    ].includes(
      phase
    );
  const prompt =
    phase === 'name'
      ? 'NAME > '
      : phase === 'invitee'
        ? 'THEIR FIRST NAME > '
        : phase === 'claimname'
          ? 'YOUR FIRST NAME > '
        : phase === 'verify'
          ? 'LAST 4 OF PHONE > '
          : '> ';

  // Free-text phases must not be force-uppercased.
  const numeric = phase === 'verify';
  const freeText =
    phase === 'name' ||
    phase === 'invitee' ||
    phase === 'claimname' ||
    numeric;
  const inputType = numeric ? 'tel' : 'text';

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
          inputMode={numeric ? 'tel' : 'text'}
          autoCapitalize={
            phase === 'name' || phase === 'invitee' || phase === 'claimname'
              ? 'words'
              : freeText
                ? 'none'
                : 'characters'
          }
          autoComplete={
            phase === 'name' || phase === 'claimname' ? 'name' : 'off'
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
