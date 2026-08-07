import { createHmac, timingSafeEqual } from 'crypto';

const COOKIE_NAME = 'hl_admin';
const SESSION_HOURS = 24 * 7;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET env var is not set');
  return s;
}

function sign(exp: string): string {
  return createHmac('sha256', secret()).update(exp).digest('hex');
}

export function checkPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Value + attributes for the session cookie after a successful login. */
export function sessionCookie(): string {
  const exp = String(Date.now() + SESSION_HOURS * 3600 * 1000);
  const attrs = [
    `${COOKIE_NAME}=${exp}.${sign(exp)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_HOURS * 3600}`,
  ];
  if (process.env.NODE_ENV === 'production') attrs.push('Secure');
  return attrs.join('; ');
}

export function isAuthed(req: Request): boolean {
  const cookies = req.headers.get('cookie') ?? '';
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;
  const [exp, sig] = match[1].split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = Buffer.from(sign(exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
