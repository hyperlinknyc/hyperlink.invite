import { randomInt } from 'crypto';
import { CODE_CHARSET, CODE_LENGTH } from './config';

/** Generate a random invite code from the unambiguous charset. */
export function generateCode(): string {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARSET[randomInt(CODE_CHARSET.length)];
  }
  return out;
}

/** Normalize user input: uppercase, strip spaces/hyphens. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isPlausibleCode(code: string): boolean {
  return (
    code.length === CODE_LENGTH &&
    [...code].every((c) => CODE_CHARSET.includes(c))
  );
}
