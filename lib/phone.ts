// Phone handling. Deliberately narrow: this party is in Brooklyn, so bare
// 10-digit input is treated as US/Canada (+1). Anything typed with a leading
// + is passed through as an international number.

export type PhoneResult =
  | { ok: true; e164: string; pretty: string }
  | { ok: false; error: string };

export function normalizePhone(raw: string): PhoneResult {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return { ok: false, error: 'no number given' };

  const intl = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  if (intl) {
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: 'that is not a valid number' };
    }
    return { ok: true, e164: `+${digits}`, pretty: `+${digits}` };
  }

  // Bare US/Canada: 10 digits, or 11 starting with 1.
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (ten.length !== 10) {
    return { ok: false, error: 'need a 10-digit number (or +country code)' };
  }
  if (ten[0] === '0' || ten[0] === '1') {
    return { ok: false, error: 'that area code is not real' };
  }
  return {
    ok: true,
    e164: `+1${ten}`,
    pretty: `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`,
  };
}

/** Mask for display in the admin console and confirmations. */
export function maskPhone(e164: string): string {
  return e164.length <= 4 ? e164 : `${e164.slice(0, -4).replace(/\d/g, '•')}${e164.slice(-4)}`;
}
