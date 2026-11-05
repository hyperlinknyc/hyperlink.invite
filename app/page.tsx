'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BLANK,
  L,
  LOGO,
  Line,
  Screen,
  useTypewriter,
} from '@/components/Terminal';
import { INTRO_MS, Logo } from '@/components/Logo';
import { DEFAULTS } from '@/lib/defaults';
import type { ChainColor } from '@/lib/config';

const EVENT_NAME = 'HYPERLINK';
// Pause before the keyboard rises on its own, so the prompt can be read first.
const KEYBOARD_DELAY_MS = 1000;

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
  /** Door terms. Optional: a session saved before they existed lacks them. */
  cover?: string;
  bar?: string;
  igHandle: string;
  igUrl: string;
  hasCalendar?: boolean;
};

const FALLBACK: Settings = {
  edition: DEFAULTS.edition,
  eventDate: DEFAULTS.eventDate,
  eventTime: DEFAULTS.eventTime,
  hood: DEFAULTS.hood,
  cover: DEFAULTS.cover,
  bar: DEFAULTS.bar,
  igHandle: DEFAULTS.igHandle,
  igUrl: DEFAULTS.igUrl,
};

type Session = {
  code: string;
  name: string;
  position: number;
  /** How full the room was when they got in — what the guest is shown. */
  seat?: number;
  capacity: number;
  childCode: string | null;
  demo?: boolean;
  /** The world's epoch when they got in; a purge changes it. Absent on sessions saved before epochs. */
  epoch?: string;
  settings?: Settings;
  // Set once their one invitation has been addressed to someone.
  inviteSent?: boolean;
  invitedName?: string;
  /** Their chain's colour, as the accept response returned it. */
  chain?: ChainColor | null;
  /** Set when the sign-off first prints, so the mark only travels once. */
  chainRevealed?: boolean;
};

const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;


const DENIALS = [
  'ACCESS DENIED.',
  'ACCESS DENIED. THE NODE REMEMBERS.',
  'ACCESS DENIED. THIS ATTEMPT HAS BEEN LOGGED.',
];

// Shown when the backend is unreachable — never blame the guest's code.
const FAULT_LINES: Line[] = [
  L('CARRIER FAULT. THE NODE DID NOT ANSWER.', 'warn'),
  L('YOUR CODE IS INTACT.', 'dim'),
  L('WAIT AND TRANSMIT AGAIN.', 'dim'),
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
  L('ALL OUTSTANDING CODES'),
  L('HAVE BEEN TERMINATED.'),
  BLANK,
  L('// NODE CLOSED', 'dim'),
];

const DEAD_LINES: Line[] = [
  L('KEY REJECTED.', 'warn'),
  L('THIS CODE HAS ALREADY BEEN SPENT'),
  L('— OR BURNED.'),
  L('ONE CODE. ONE HOLDER. ONE CHANCE.'),
  L('THE LINK IS DEAD.', 'dim'),
  BLANK,
];

/* 42 characters is the capacity of the log column at 414px, but a 360px phone
   holds 41 and wraps the last dash onto a line of its own — two stray dashes
   under the event block. 40 fits every width measured, and anything longer
   soft-wraps to column 0 and loses its indent, which is what the
   hand-breaking elsewhere on this screen exists to prevent. */
const RULE: Line = L('─'.repeat(40), 'dim');

/** The date row, omitted entirely while the date is still to be settled. */
function dateLine(s: Settings): Line[] {
  const parts = [s.eventDate, s.eventTime].filter((p) => p && p.trim());
  return parts.length ? [L(parts.join(' // '))] : [];
}

/** The closing detail rows. One 65-character line before — well past the
 *  42 the column can hold — so it is split, and the date is dropped entirely
 *  while it is still to be settled. */
function closingDetails(cfg: Settings): Line[] {
  const when = [cfg.eventDate, cfg.eventTime].filter((p) => p && p.trim());
  return [
    ...(when.length ? [L(when.join(' // '))] : []),
    L(`${cfg.hood} // ${cfg.bar || FALLBACK.bar}`),
  ];
}

function boxAround(code: string): Line[] {
  const inner = `   ${code}   `;
  return [
    L(`┌${'─'.repeat(inner.length)}┐`),
    { spans: [{ t: '│' }, { t: inner }, { t: '│' }] },
    L(`└${'─'.repeat(inner.length)}┘`),
  ];
}

// The first thing a guest must do: say what to do, and where the code lives.
const ACCESS_PROMPT: Line[] = [
  L('ENTER YOUR ACCESS CODE.'),
  L('TYPE IT BELOW — IT CAME WITH YOUR INVITE.', 'dim'),
];

const VERIFY_PROMPT: Line[] = [
  BLANK,
  L('THIS INVITATION WAS SENT TO ONE PHONE.'),
  L('ENTER THE LAST 4 DIGITS OF YOUR PHONE'),
  L('NUMBER TO PROVE IT REACHED THE RIGHT'),
  L('PERSON.'),
  L('IF YOU CANNOT VALIDATE IT,', 'dim'),
  L('THIS INVITE IS NOT YOURS.', 'dim'),
  BLANK,
];

const CLAIM_NAME_PROMPT: Line[] = [
  BLANK,
  L('THIS INVITATION HAS A NAME ON IT.'),
  L('TYPE YOUR FIRST NAME TO OPEN IT.'),
  L('WE WILL NOT TELL YOU WHOSE.', 'dim'),
  L('YOU EITHER KNOW OR YOU DO NOT.', 'dim'),
  BLANK,
];

// Marks a demo run so a sandbox pass is never mistaken for the real thing.
const DEMO_BANNER: Line[] = [
  L('*** SIMULATION — DEMO WORLD. ***', 'warn'),
  L('*** NOT THE REAL GUEST LIST. ***', 'warn'),
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
    /* The event details are the one thing a guest actually needs to carry
       away, and they were rendering at the same weight as the surrounding
       machine chatter. Fenced off with rules, and the two lines nobody needs
       to read twice dropped to `dim`, so edition, date and place are the
       brightest lines on the screen. Colour cannot do this job here — `warn`
       is danger only and `cta` belongs to Instagram. */
    RULE,
    L(`${EVENT_NAME} — ${s.edition}`),
    // Both halves can be blank while a date is still being settled; joining
    // them unconditionally would render a bare " // ".
    ...dateLine(s),
    L(s.hood),
    RULE,
    L(`COVER: ${s.cover || FALLBACK.cover}. BAR: ${s.bar || FALLBACK.bar}.`, 'dim'),
    L(`CAPACITY: ${capacity}. SEATS OPEN: ${spotsRemaining}.`, 'dim'),
    L('ADDRESS: WITHHELD FOR NOW. KEEP READING.', 'dim'),
    BLANK,
    L('THE RULES:'),
    L('1. THIS CODE ADMITS YOU. ONLY YOU.'),
    L('2. ACCEPT, AND YOU CAN BRING ONE PERSON.'),
    L('   NAME THEM, THEN SEND IT'),
    L('   STRAIGHT FROM YOUR PHONE.'),
    L('   PICK THE ONE YOU WANT BESIDE YOU.'),
    // A term of entry, so it sits with the other terms rather than arriving
    // as a surprise at the door. Body text, not warn — amber is danger only.
    // Hand-broken to stay under the column: a soft-wrapped line drops to
    // column 0 and loses its indent, which is how "ONLY," once escaped the
    // margin. Keep every line here at 38 characters or fewer.
    L('3. PHONE CAMERAS SEALED AT THE DOOR.'),
    L('   WE SHOOT ON DISPOSABLES —'),
    L("   STORIES ONLY, ON HYPERLINK'S"),
    L('   INSTAGRAM, A FEW DAYS AFTER.'),
    L('   NOT INTO IT? LET THE DOOR KNOW.'),
    L('4. DECLINE, AND THIS CODE DIES.', 'warn'),
    L('   PERMANENTLY. IT WILL NEVER OPEN', 'warn'),
    L('   AGAIN, FOR YOU OR ANYONE.', 'warn'),
    L('   YOUR SEAT GOES BACK IN THE POOL.', 'warn'),
    BLANK,
    L('THE CHAIN IS THE GUEST LIST.'),
    L('YOU ARE HOLDING A LINK.'),
    // A norm, not a rule, so it sits outside the numbered block. The pair is
    // deliberate: one line retires the job, the other retires performing for
    // the room. Matched construction so it reads as a single statement.
    L('NOBODY CARES WHAT YOU DO OUT THERE.'),
    L('NOBODY CARES WHAT YOU DO IN HERE.'),
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
  L('CODE TERMINATED.'),
  L('THE CHAIN CLOSES AROUND THE GAP.'),
  L('FORGET THE DATE. FORGET THE NEIGHBORHOOD.'),
  L('NONE OF THIS WAS REAL.'),
  BLANK,
  L('// CARRIER LOST', 'dim'),
  BLANK,
  LOGO,
  BLANK,
];

/**
 * Name first, deliberately. The Instagram link is the only thing on the whole
 * flow that navigates away, and anyone who taps it mid-accept never comes back
 * to finish — no name, no seat, while believing they are in. So the requirement
 * is stated here in plain text and the tappable link waits until the end, once
 * their place is actually secured.
 */
function namePromptLines(
  cfg: Settings,
  invitedName?: string | null,
  finalSeat = false
): Line[] {
  return [
    BLANK,
    // The one moment the terminal drops its register. Everything up to here
    // has been withholding and formal on purpose; answering the commitment
    // with 'COMMITMENT LOGGED.' met the warmest beat in the flow with a filing
    // receipt. Three plain words are the payoff for the cold gate.
    L('YOU ARE IN.'),
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
          L('THIS IS THE NAME ON THE DOOR.', 'dim'),
          L('NOTHING ELSE IS.', 'dim'),
        ]),
    BLANK,
    // The final seat has nobody to invite, so their one next step is Instagram.
    ...(finalSeat
      ? [L('(NEXT STEP: FOLLOW US ON INSTAGRAM.)', 'dim')]
      : [
          L('(NEXT STEPS: INVITE SOMEONE, THEN', 'dim'),
          L(' FOLLOW US ON INSTAGRAM.)', 'dim'),
        ]),
    BLANK,
  ];
}

/** Why Instagram is required, shown only once the guest is safely on the list. */
function instagramNote(cfg: Settings): Line[] {
  return [
    {
      spans: [
        { t: 'THE ' },
        { t: 'HYPERLINK INSTAGRAM', href: cfg.igUrl },
        { t: ' IS PRIVATE.' },
      ],
    },
    L('REQUEST TO FOLLOW AND WE LET YOU IN.'),
    L('FOLLOWING IS MANDATORY.'),
    L('THE ADDRESS IS THE ONLY THING WE'),
    L('HOLD BACK. WE POST IT THERE, SEEN'),
    L('ONLY BY PEOPLE WE APPROVED.'),
    L('IF YOU ARE NOT FOLLOWING WHEN IT', 'warn'),
    L('DROPS, YOU WILL NOT KNOW WHERE.', 'warn'),
  ];
}

/**
 * The Instagram link: printed after the mark has
 * settled on the chain's colour. It is the one thing here that leaves the
 * page, so a guest sees their colour before they can reach it. The
 * instruction sits directly above it, so there is no guessing what to tap.
 */
function instagramLink(cfg: Settings): Line[] {
  return [
    L('TAP THE GREEN LINK TO FOLLOW.'),
    {
      spans: [{ t: '>> OPEN INSTAGRAM <<', href: cfg.igUrl, cls: 'cta' }],
    },
  ];
}

/** The calendar link, offered only when there is a real datetime behind it. */
function calendarLink(cfg: Settings): Line[] {
  return cfg.hasCalendar
    ? [{ spans: [{ t: '>> ADD TO CALENDAR <<', href: '/api/ical', cls: 'cta' }] }]
    : [];
}

function payoffLines(s: Session, restored = false, animateChain = false): Line[] {
  // A restored session carries the latest copy the node gave it.
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

  // Occupancy, not the chain position. `position` never reuses a number, so
  // once anyone is removed it runs ahead of how full the room actually is —
  // showing it would read as "GUEST 45 OF 40".
  const taken = s.seat ?? s.position;
  const seat: Line[] = [
    L(
      `GUEST ${String(taken).padStart(2, '0')} OF ${s.capacity}. ` +
        `${Math.max(0, s.capacity - taken)} SEATS REMAIN BEHIND YOU.`
    ),
    BLANK,
  ];

  if (!s.childCode) {
    return [
      ...head,
      ...seat,
      L('YOU TOOK THE FINAL SEAT.', 'warn'),
      L('THE CHAIN ENDS WITH YOU.'),
      L('NO FURTHER INVITATIONS EXIST.'),
      BLANK,
      // Repeated on the screen guests come back to.
      L('PHONE CAMERAS SEALED AT THE DOOR.'),
      L('WE SHOOT ON DISPOSABLES. STORIES LATER.'),
      BLANK,
      ...closingDetails(cfg),
      ...calendarLink(cfg),
      // The mark and chain name come before the Instagram link, never after;
      // the Instagram explainer follows the link.
      ...signOff(s.chain, animateChain),
      ...instagramLink(cfg),
      BLANK,
      ...instagramNote(cfg),
      BLANK,
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
    L('WHO ARE YOU BRINGING?'),
    L('TYPE THEIR FIRST NAME. THAT IS ENOUGH.'),
    L('YOU PICK THEM FROM YOUR OWN CONTACTS', 'dim'),
    L('ON THE NEXT TAP. THERE IS NO NUMBER', 'dim'),
    L('TO LOOK UP.', 'dim'),
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
    L('IT SENDS FROM YOUR OWN PHONE, SO IT', 'dim'),
    L('LANDS FROM A NUMBER THEY ALREADY KNOW.', 'dim'),
    L('PICK THEM ON THE NEXT SCREEN.', 'dim'),
    BLANK,
  ];
}

/**
 * Everything after the send. Held back until they have actually tapped it,
 * so the screen carries one instruction at a time — and so the Instagram
 * link, the only thing here that leaves the page, comes last.
 */
function afterSendLines(
  cfg: Settings,
  chain?: ChainColor | null,
  animateChain = false,
  hold?: number
): Line[] {
  return [
    BLANK,
    L('THAT WAS YOUR ONE INVITATION.'),
    L('THERE ARE NO MORE.'),
    BLANK,
    // Same reminder on the other closing path. A guest reaches exactly one of
    // these two, so it still shows once each.
    L('PHONE CAMERAS SEALED AT THE DOOR.'),
    L('WE SHOOT ON DISPOSABLES. STORIES LATER.'),
    BLANK,
    ...closingDetails(cfg),
    ...calendarLink(cfg),
    // The mark and chain name come before the Instagram link, never after;
      // the Instagram explainer follows the link.
    ...signOff(chain, animateChain, hold),
    ...instagramLink(cfg),
    BLANK,
    ...instagramNote(cfg),
    BLANK,
  ];
}

/**
 * The mark and the chain's name. With a chain, the mark turns to its colour,
 * then the name types beneath it — so colour is never the only signal. The
 * typewriter holds here until the colour has settled, and the Instagram link
 * prints after it, so the link cannot be reached before the reveal is seen.
 * Without a chain (a session saved before chains had colours) it stays the
 * brand green, as before.
 */
function signOff(chain?: ChainColor | null, animate = false, hold?: number): Line[] {
  const head: Line[] = [
    BLANK,
    L('SEE YOU IN THE DARK.'),
    L('// EVERY LINK LEADS TO ANOTHER', 'dim'),
    BLANK,
  ];
  if (!chain) return [...head, LOGO, BLANK];

  // The name waits for the mark itself to finish, not for a timer: the mark's
  // clock stops while the page is hidden, so a timer would name the colour
  // before a guest who tapped away and came back had ever seen it change.
  let settled = () => {};
  const finished = animate
    ? new Promise<void>((resolve) => {
        settled = resolve;
      }).then(() => new Promise<void>((r) => setTimeout(r, 250)))
    : null;
  return [
    ...head,
    { ...LOGO, chain, animate, hold, onSettled: settled },
    ...(finished ? [{ spans: [], wait: finished }] : []),
    { spans: [{ t: `// ${chain.name} CHAIN` }], cls: 'chain-label', color: chain.hex },
    BLANK,
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
  // The terminal opens on a gate. Phones only raise the keyboard from code
  // inside a tap, so this tap — dressed as answering the incoming call — is
  // where the input takes focus. It stays mounted and focused, with its
  // keyboard held back until a prompt actually needs an answer.
  const [gate, setGate] = useState(true);
  const [intro, setIntro] = useState(false);
  // True once a prompt has waited a moment with no keyboard on screen, on a
  // touch device: the guest may not know the screen itself is the way in.
  const [hintReady, setHintReady] = useState(false);
  const [keyboardUp, setKeyboardUp] = useState(false);
  const answerRef = useRef<() => void>(() => {});
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
  // True when the guest would take the last seat: nobody left to invite.
  const finalSeatRef = useRef(false);
  const last4Ref = useRef('');

  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://hyperlink.nyc';

  // ── boot sequence ──────────────────────────────────────────────
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    (async () => {
      const statusP = fetch('/api/status').then((r) => r.json()).catch(() => null);
      const answered = new Promise<void>((r) => {
        answerRef.current = r;
      });

      // Dev-only: /?chainPreview=BLUE plays the closing screen in that chain's
      // colour without spending a code. NODE_ENV is inlined at build time, so
      // a production build strips this branch and the palette import with it.
      if (process.env.NODE_ENV !== 'production') {
        const want = new URLSearchParams(window.location.search).get('chainPreview');
        if (want) {
          setGate(false);
          const status = await statusP;
          if (status?.settings) settingsRef.current = status.settings;
          const { CHAIN_PALETTE, chainColor } = await import('@/lib/config');
          const chain = chainColor(want.toUpperCase());
          await typeLines([
            L('*** CHAIN PREVIEW — DEV ONLY. ***', 'warn'),
            L('*** NO CODE WAS SPENT. ***', 'warn'),
            ...(chain
              ? // A short hold: the preview is for looking at colours, not reading.
                afterSendLines(settingsRef.current, chain, !reducedMotion(), 1500)
              : [
                  BLANK,
                  L(`NO CHAIN CALLED ${want.toUpperCase()}. TRY:`),
                  ...CHAIN_PALETTE.map((c) => L(`  /?chainPreview=${c.name}`, 'dim')),
                ]),
          ]);
          setPhase('end');
          return;
        }
      }

      // Hold on the gate until the guest answers (see `gate` above).
      await answered;
      setGate(false);

      // The mark powers on first, alone and centred on the screen — flash,
      // tear, lock in — so the page reads as a real, branded thing before any
      // code starts to print.
      if (!reducedMotion()) {
        setIntro(true);
        await new Promise<void>((r) => setTimeout(r, INTRO_MS));
        setIntro(false);
        await new Promise<void>((r) => setTimeout(r, 250)); // overlay fade-out
      }
      await typeLines(BOOT);
      const status = await statusP;
      if (status?.settings) settingsRef.current = status.settings;

      // Returning guest: restore their minted code from this device.
      let saved: Session | null = null;
      try {
        saved = JSON.parse(localStorage.getItem('hl_session') ?? 'null');
      } catch {}

      // Share links arrive as /?c=CODE.
      const c = new URLSearchParams(window.location.search).get('c');
      const linkCode = c ? c.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

      // A link to some other code wins over the saved session: they came to
      // use that code. The saved session stays on the device untouched until
      // the new code is actually accepted (which overwrites it), so a guest
      // who just peeks at a friend's link doesn't lose their own seat.
      // Their own child code is the exception — that is still them.
      if (
        saved?.code &&
        linkCode &&
        linkCode !== saved.code &&
        linkCode !== saved.childCode
      ) {
        saved = null;
      }

      // Never trust the local copy blindly. A purge, revoke or kill happens on
      // the server and cannot reach this device, so ask before replaying it.
      // A node that doesn't answer isn't proof of anything: keep the session.
      if (saved?.code) {
        const worldChanged =
          !!saved.epoch && !!status?.epoch && saved.epoch !== status.epoch;
        const check = worldChanged
          ? { result: 'gone' }
          : await api('/api/session', { code: saved.code, epoch: saved.epoch });
        if (check?.result === 'gone') {
          try {
            localStorage.removeItem('hl_session');
          } catch {}
          saved = null;
        }
      }

      if (saved?.code) {
        // Replay with the event details as they stand now — the date and the
        // neighbourhood are edited from admin after people accept. The copy
        // saved at accept time only stands in when the node did not answer.
        if (status?.settings) saved.settings = status.settings;
        sessionRef.current = saved;
        saveSession();
        if (saved.inviteSent) {
          // Already spent their invitation — replay the closing screen.
          const animate = claimChainReveal();
          await typeLines([
            ...(saved.demo ? DEMO_BANNER : []),
            L('SESSION RESTORED FROM LOCAL BUFFER.', 'dim'),
            BLANK,
            L(`YOU ARE ALREADY IN THE CHAIN, ${saved.name}.`),
            ...sentLines(saved.invitedName ?? 'YOUR GUEST'),
            ...afterSendLines(saved.settings ?? FALLBACK, saved.chain, animate),
          ]);
          setPhase('end');
          return;
        }
        // Accepted but never named anyone — send them back to that prompt.
        // The final seat has nobody to name; their screen is the sign-off.
        const animate = saved.childCode ? false : claimChainReveal();
        await typeLines(payoffLines(saved, true, animate));
        setPhase(saved.childCode ? 'invitee' : 'end');
        return;
      }

      // Only seal the door for someone arriving empty-handed. A code in hand
      // gets validated on its own terms — that's what keeps demo codes usable
      // after the real party has filled, and a real code still hears 'full'.
      if (status?.full && !c) {
        await typeLines(FULL_LINES);
        setPhase('end');
        return;
      }

      await typeLines(ACCESS_PROMPT);
      setPhase('code');

      if (c) {
        const clean = linkCode.slice(0, 12);
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
      finalSeatRef.current = res.spotsRemaining === 1;
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
      await typeLines(ACCESS_PROMPT);
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
      await typeLines([L(msg, 'warn'), ...ACCESS_PROMPT]);
    }
  }

  async function submitVerify(value: string) {
    const digits = value.replace(/\D/g, '');
    print([L(`> ${digits || value}`, 'dim')]);
    if (digits.length !== 4) {
      await typeLines([
        L('FOUR DIGITS — THE LAST 4 OF', 'warn'),
        L('YOUR PHONE NUMBER.', 'warn'),
      ]);
      return;
    }
    last4Ref.current = digits;
    await typeLines([L('CHECKING ...', 'dim')]);
    const res = await api('/api/code', { code: codeRef.current, last4: digits });
    if (res?.result === 'valid') {
      demoRef.current = !!res.demo;
      invitedNameRef.current = res.invitedName ?? null;
      finalSeatRef.current = res.spotsRemaining === 1;
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
      finalSeatRef.current = res.spotsRemaining === 1;
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
      await typeLines(namePromptLines(
          settingsRef.current,
          invitedNameRef.current,
          finalSeatRef.current
        ));
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
      await typeLines(namePromptLines(
          settingsRef.current,
          invitedNameRef.current,
          finalSeatRef.current
        ));
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
    await typeLines([
      L('TYPE DECLINE TO CONFIRM,'),
      L('OR ACCEPT TO RECONSIDER.'),
    ]);
  }

  function saveSession() {
    const s = sessionRef.current;
    if (!s) return;
    try {
      // A demo run must not overwrite a real guest's saved session.
      if (!s.demo) localStorage.setItem('hl_session', JSON.stringify(s));
    } catch {}
  }

  /**
   * Call as the sign-off is about to print. Returns whether the mark should
   * travel to the chain colour, and records that it has, so the transition
   * plays once per guest — a return visit shows the settled colour. Saved
   * before it plays, so leaving mid-transition still counts as seen.
   */
  function claimChainReveal(): boolean {
    const s = sessionRef.current;
    if (!s?.chain) return false;
    const animate = !s.chainRevealed && !reducedMotion();
    s.chainRevealed = true;
    saveSession();
    return animate;
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
      await typeLines([
        L('SHORTER. THIS IS A DOOR LIST,', 'warn'),
        L('NOT A BIOGRAPHY.', 'warn'),
      ]);
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
        seat: res.accepted ?? res.position,
        capacity: res.capacity,
        childCode: res.childCode,
        demo: !!res.demo,
        epoch: res.epoch,
        settings: settingsRef.current,
        chain: res.chain ?? null,
      };
      sessionRef.current = session;
      // The final seat reaches the sign-off right here; everyone else gets
      // it after sending their invitation.
      const animate = session.childCode ? false : claimChainReveal();
      saveSession();
      await typeLines(payoffLines(session, false, animate));
      // The final guest gets no child code — payoffLines already closes them
      // out, so there is nobody for them to name.
      setPhase(session.childCode ? 'invitee' : 'end');
    } else if (res?.result === 'full') {
      await typeLines([
        L('THE LAST SEAT WAS TAKEN', 'warn'),
        L('WHILE YOU HESITATED.', 'warn'),
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
    const animate = claimChainReveal();
    await typeLines(
      afterSendLines(settingsRef.current, sessionRef.current?.chain, animate)
    );
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

  // Raise the keyboard whenever the terminal is waiting for input, after a
  // short pause so the prompt text can be read first. The input already holds
  // focus from the opening tap; going from inputMode 'none' to a real mode is
  // what brings the keyboard up. The focus() covers a lost focus.
  useEffect(() => {
    if (!awaiting) return;
    const t = setTimeout(() => inputRef.current?.focus(), KEYBOARD_DELAY_MS);
    return () => clearTimeout(t);
  }, [awaiting, phase]);

  // The visual viewport shrinks when a phone keyboard is open.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const sync = () => setKeyboardUp(window.innerHeight - vv.height > 120);
    sync();
    vv.addEventListener('resize', sync);
    return () => vv.removeEventListener('resize', sync);
  }, []);

  useEffect(() => {
    setHintReady(false);
    if (!awaiting) return;
    if (!window.matchMedia('(pointer: coarse)').matches) return; // desktop: no hint
    const t = setTimeout(() => setHintReady(true), KEYBOARD_DELAY_MS + 900);
    return () => clearTimeout(t);
  }, [awaiting, phase]);

  // Not on the accept/decline step: its own line already says tap or type.
  const typing = phase !== 'decision' && phase !== 'confirmDecline';
  const hint = awaiting && typing && hintReady && !keyboardUp ? 'TAP ANYWHERE TO TYPE' : null;

  return (
    <>
    {/* Opening glitch: the mark alone, dead centre, before any text. */}
    <div
      className={`intro${gate || intro ? ' on' : ''}`}
      aria-hidden={!gate}
      onClick={
        gate
          ? () => {
              // Inside the tap: takes focus (no keyboard yet — see inputMode)
              // so the input can raise it later without another tap.
              inputRef.current?.focus();
              answerRef.current();
            }
          : undefined
      }
    >
      {gate && (
        <div className="gate">
          <div className="line dim">INCOMING CARRIER ..... 300 BAUD</div>
          <div className="line gate-cta">[ TAP TO ANSWER ]</div>
        </div>
      )}
      {intro && <Logo glitch />}
    </div>
    <Screen
      done={done}
      current={current}
      inputLine={awaiting ? { prompt, value: input } : null}
      hint={hint}
      onAct={onAct}
      onSubmit={awaiting ? () => submit(input) : undefined}
      onTap={() => {
        skip();
        inputRef.current?.focus();
      }}
    >
      {/* Always mounted so focus (and the open keyboard) survives between
          prompts; typing is ignored while the terminal is busy. */}
      <input
          ref={inputRef}
          className="ghost"
          value={awaiting ? input : ''}
          onChange={(e) => {
            if (!awaiting) return;
            setInput(freeText ? e.target.value : e.target.value.toUpperCase());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && awaiting) submit(input);
          }}
          type={inputType}
          // 'none' keeps focus without a keyboard. It flips to the real mode
          // when a prompt needs an answer, which is what raises the keyboard.
          inputMode={awaiting ? (numeric ? 'tel' : 'text') : 'none'}
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
          aria-label={phase}
        />
    </Screen>
    </>
  );
}
