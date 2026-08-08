import { NextResponse } from 'next/server';
import { normalizeCode, isPlausibleCode } from '@/lib/codes';
import {
  claimInvite,
  claimInviteByName,
  codeInfo,
  markSms,
} from '@/lib/invites';
import { normalizePhone, maskPhone } from '@/lib/phone';
import { buildInviteMessage, smsHandoffLink, smsMode, sendSms } from '@/lib/sms';
import { clientIp, overLimit } from '@/lib/rateLimit';
import { WORLD_DEMO } from '@/lib/defaults';

export const dynamic = 'force-dynamic';

/**
 * Point a freshly minted code at someone.
 *
 * Two shapes:
 *  - { name }  the share-sheet path guests use. No phone lookup: the OS
 *              share sheet is the contact picker, and the recipient supplies
 *              their own number when they arrive.
 *  - { phone } the admin path, which pre-locks a code to one handset and
 *              gets the last-4 gate.
 */
export async function POST(req: Request) {
  if (await overLimit(clientIp(req))) {
    return NextResponse.json({ result: 'ratelimited' }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const code = normalizeCode(String(body.code ?? ''));
  if (!isPlausibleCode(code)) return NextResponse.json({ result: 'invalid' });

  const info = await codeInfo(code);
  if (info === null) return NextResponse.json({ result: 'invalid' });
  if (info.status !== 'unused') return NextResponse.json({ result: 'spent' });

  const origin = new URL(req.url).origin;
  const fromHost = info.depth === 0;

  // ── share-sheet path ────────────────────────────────────────────────
  if (body.name !== undefined) {
    const invitedName = String(body.name).trim().replace(/\s+/g, ' ').slice(0, 40);
    if (invitedName.length < 1) {
      return NextResponse.json({ result: 'badname' });
    }
    const claim = await claimInviteByName(code, invitedName);
    if (!claim.ok) return NextResponse.json({ result: claim.reason });

    const message = buildInviteMessage({
      code,
      origin,
      fromHost,
      invitedName: claim.invitedName,
    });
    return NextResponse.json({
      result: 'named',
      alreadyNamed: claim.alreadyNamed,
      invitedName: claim.invitedName,
      message,
      url: `${origin}/?c=${code}`,
    });
  }

  // ── admin path: pre-lock to a number ────────────────────────────────
  const phone = normalizePhone(String(body.phone ?? ''));
  if (!phone.ok) return NextResponse.json({ result: 'badphone', error: phone.error });

  const claim = await claimInvite(code, phone.e164, '');
  if (!claim.ok) return NextResponse.json({ result: 'invalid' });

  const message = buildInviteMessage({ code, origin, fromHost });

  if (claim.alreadySent) {
    return NextResponse.json({
      result: 'already',
      masked: maskPhone(claim.phone),
      message,
      handoffLink: smsHandoffLink(claim.phone, message),
      mode: smsMode(),
    });
  }

  // Demo codes never send a real text, whatever the mode.
  if (info.world === WORLD_DEMO || smsMode() === 'handoff') {
    await markSms(code, 'handoff');
    return NextResponse.json({
      result: 'handoff',
      masked: maskPhone(phone.e164),
      message,
      handoffLink: smsHandoffLink(phone.e164, message),
      mode: 'handoff',
    });
  }

  const sent = await sendSms(phone.e164, message);
  await markSms(code, sent.ok ? 'sent' : 'failed', sent.ok ? undefined : sent.error);
  return NextResponse.json({
    result: sent.ok ? 'sent' : 'failed',
    masked: maskPhone(phone.e164),
    message,
    handoffLink: smsHandoffLink(phone.e164, message),
    mode: 'server',
  });
}
