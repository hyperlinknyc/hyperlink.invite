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
}): string {
  const link = `${opts.origin}/?c=${opts.code}`;
  const lead = opts.passphrase
    ? [`"${opts.passphrase}"`, ``, `whoever that means to you put you on a list.`]
    : [`i can bring one person. it's you.`];
  return [...lead, ``, link, ``, `one code, one use. don't post it.`].join('\n');
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
