import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import { claimInvite, codeInfo, markSms } from '@/lib/invites';
import { normalizePhone, maskPhone } from '@/lib/phone';
import { buildInviteMessage, smsHandoffLink, smsMode, sendSms } from '@/lib/sms';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { WORLD_DEMO } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

/**
 * Point a minted invite at one person and deliver it.
 * In 'server' mode hyperlink.nyc sends the text; in 'handoff' mode we return
 * an sms: link so the invitation goes out from the inviter's own phone.
 */
export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  const passphrase = String(body.passphrase ?? '').trim();

  if (!isPlausibleCode(code)) return NextResponse.json({ result: 'invalid' });

  const phone = normalizePhone(String(body.phone ?? ''));
  if (!phone.ok) return NextResponse.json({ result: 'badphone', error: phone.error });

  // Optional: handoff needs no shared secret, since the message arrives from
  // a number the recipient already knows. Only server-sent mode uses it.
  if (passphrase && passphrase.length > 120) {
    return NextResponse.json({ result: 'badpassphrase' });
  }

  const info = await codeInfo(code);
  if (info === null) return NextResponse.json({ result: 'invalid' });
  if (info.status !== 'unused') return NextResponse.json({ result: 'dead' });

  const claim = await claimInvite(code, phone.e164, passphrase);
  if (!claim.ok) return NextResponse.json({ result: 'invalid' });

  const origin = new URL(req.url).origin;
  // A passphrase is only woven in when hyperlink.nyc is the sender.
  const compose = (pass: string) =>
    buildInviteMessage({
      code,
      origin,
      passphrase: smsMode() === 'server' ? pass || undefined : undefined,
      // Depth 0 means you minted it, so the message speaks as the host.
      fromHost: info.depth === 0,
    });

  // Already delivered — don't send twice. Echo back what is actually on file,
  // not what was just typed, so nobody thinks it went to a new number.
  if (claim.alreadySent) {
    const sentMessage = compose(claim.passphrase);
    return NextResponse.json({
      result: 'already',
      masked: maskPhone(claim.phone),
      message: sentMessage,
      handoffLink: smsHandoffLink(claim.phone, sentMessage),
      mode: smsMode(),
    });
  }

  const message = compose(passphrase);

  // Demo codes never send a real text, whatever the mode.
  if (info.world === WORLD_DEMO) {
    await markSms(code, 'handoff');
    return NextResponse.json({
      result: 'handoff',
      demo: true,
      masked: maskPhone(phone.e164),
      message,
      handoffLink: smsHandoffLink(phone.e164, message),
      mode: 'handoff',
    });
  }

  if (smsMode() === 'server') {
    const sent = await sendSms(phone.e164, message);
    if (sent.ok) {
      await markSms(code, 'sent');
      return NextResponse.json({
        result: 'sent',
        masked: maskPhone(phone.e164),
        mode: 'server',
      });
    }
    // Carrier or account problem — fall back to the inviter's own phone
    // rather than stranding a guest with an undelivered invitation.
    await markSms(code, 'failed', sent.error);
    return NextResponse.json({
      result: 'handoff',
      fellBack: true,
      masked: maskPhone(phone.e164),
      message,
      handoffLink: smsHandoffLink(phone.e164, message),
      mode: 'handoff',
    });
  }

  await markSms(code, 'handoff');
  return NextResponse.json({
    result: 'handoff',
    masked: maskPhone(phone.e164),
    message,
    handoffLink: smsHandoffLink(phone.e164, message),
    mode: 'handoff',
  });
}
