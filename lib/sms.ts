import { DEFAULTS } from './defaults';

// ── SMS delivery ─────────────────────────────────────────────────────
// Two modes, chosen by whether Twilio credentials are present:
//
//   handoff  (no credentials) — the site does NOT send anything. It builds
//            the message and hands it to the inviter's own phone via an
//            sms: link, so the text arrives from a number their friend
//            already knows. Works today, costs nothing, needs no carrier
//            registration, and no consent problem: a person is texting
//            their own contact.
//
//   server   (credentials set) — hyperlink.nyc sends the text itself via
//            Twilio. Requires a paid number and, for US recipients, A2P
//            10DLC brand + campaign registration, or carriers filter it.
//
// The rest of the app doesn't care which is active.

export type SmsMode = 'handoff' | 'server';

export function smsMode(): SmsMode {
  return process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM
    ? 'server'
    : 'handoff';
}

/**
 * The invitation text.
 *
 * Written in the SENDER's voice, not the brand's — in handoff mode this
 * arrives from the inviter's own number, so anything that sounds like a
 * broadcast reads as forged. It stays deliberately bare: no Instagram
 * handle, no date, no neighborhood. Those are revealed on the site after
 * the invitation is accepted, which is what makes the link worth opening.
 *
 * `passphrase` is optional and unused in handoff mode, where the sender's
 * own number is already the proof of authenticity. It exists for server-sent
 * mode, where a message from an unknown number does need a shared secret.
 */
export function buildInviteMessage(opts: {
  code: string;
  origin: string;
  passphrase?: string;
  /** True for a seed code you issue yourself, false for a guest's invite. */
  fromHost?: boolean;
  /** Live settings if you have them; falls back to the seed values. */
  hood?: string;
  capacity?: number;
}): string {
  const link = `${opts.origin}/?c=${opts.code}`;
  const hood = (opts.hood ?? DEFAULTS.hood).toLowerCase();
  const cap = opts.capacity ?? DEFAULTS.capacity;

  /*
   * The bareness here used to be the whole point — no date, no neighbourhood,
   * nothing but a link, so that opening it was the only way to find out. That
   * still holds for the DATE and the ADDRESS, which remain the payoff.
   *
   * What it cost was believability. A bare link plus an unexplained six-
   * character code plus "don't post it" is the exact shape of a phishing text,
   * and the terminal it opens on says UNAUTHORIZED ACCESS IS LOGGED. Enough
   * people read that as a scam and never tap.
   *
   * The fix is not explanation. An earlier draft apologised for the site
   * being theatrical, which kills the mystique to buy safety it did not need.
   * What actually reads as a scam is GENERIC VOICE — a scam text sounds like
   * nobody. This arrives from the sender's own number, so the job is to sound
   * like them the whole way down: one voice, not a friend's line followed by a
   * press release followed by a disclaimer.
   *
   * So it names the category once ("a party"), gives scale and neighbourhood,
   * and stops. The date and the address are still the payoff for opening it.
   */
  const lead = opts.passphrase
    ? [`"${opts.passphrase}"`, ``, `whoever that means to you put you on a list.`]
    : opts.fromHost
      ? [`i'm throwing a party. you're on the list.`]
      : // Two sentences, not one. The full stop is the effect: statement,
        // then the reveal. Running them together loses the beat.
        [`i can bring one person. it's you.`];

  return [
    ...lead,
    ``,
    // Says "party" once, plainly — that is the whole anti-scam job. No
    // "invite-only": the mechanism already proves it, and claiming
    // exclusivity out loud reads try-hard. This line is the chain, which is
    // the actual allure, and it flatters obliquely rather than directly.
    // The host's lead already said "party" — naming it twice reads clumsy.
    // Only the guest and passphrase leads need the category stated.
    opts.fromHost
      ? `${cap} people, one room in ${hood}.`
      : `it's a party — ${cap} people, one room in ${hood}.`,
    `everyone there was brought by someone.`,
    ``,
    // The code is NOT printed separately. "your code: XXXXXX" is the exact
    // format of a 2FA scam text; the link already carries it.
    link,
    ``,
    `one code, one use. this one's yours.`,
  ].join('\n');
}

/** Deep link that opens the inviter's own SMS app, pre-addressed and pre-filled. */
export function smsHandoffLink(phoneE164: string, body: string): string {
  // iOS wants ?&body=, Android accepts ?body=. The ?& form works on both.
  return `sms:${phoneE164}?&body=${encodeURIComponent(body)}`;
}

export type SendResult =
  | { ok: true; providerId: string }
  | { ok: false; error: string };

/** Send via Twilio. Only called when smsMode() === 'server'. */
export async function sendSms(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;
  if (!sid || !token || !from) return { ok: false, error: 'sms not configured' };

  const params = new URLSearchParams({ To: to, From: from, Body: body });
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      }
    );
    const data = (await res.json()) as { sid?: string; message?: string };
    if (!res.ok) return { ok: false, error: data.message ?? `http ${res.status}` };
    return { ok: true, providerId: data.sid ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
