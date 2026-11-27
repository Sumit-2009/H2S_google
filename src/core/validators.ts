import type { CardNetwork, EntityCategory } from './types';

const VERHOEFF_D: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: readonly (readonly number[])[] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/**
 * Validates a 12-digit numeric string against the Verhoeff dihedral checksum.
 * Passing Verhoeff confirms mathematical checksum integrity only, not UIDAI issuance.
 */
export function isValidVerhoeff(digits: string): boolean {
  if (!/^\d{12}$/.test(digits)) return false;
  let checksum = 0;
  for (let i = 0; i < digits.length; i++) {
    const digit = digits.charCodeAt(digits.length - 1 - i) - 48;
    checksum = VERHOEFF_D[checksum][VERHOEFF_P[i % 8][digit]];
  }
  return checksum === 0;
}

/**
 * Validates a numeric digit sequence using the Luhn (mod 10) checksum.
 */
export function isValidLuhn(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/**
 * Identifies a likely payment card network strictly from well-established IIN/BIN ranges
 * and expected digit lengths. Returns null when digits do not match any recognized card prefix.
 */
export function identifyCardNetwork(digits: string): CardNetwork | null {
  const len = digits.length;

  // Visa: starts with 4, lengths 13, 16, or 19
  if (/^4\d+$/.test(digits) && (len === 13 || len === 16 || len === 19)) {
    return 'Visa';
  }

  // American Express: starts with 34 or 37, length 15
  if (/^3[47]\d{13}$/.test(digits)) {
    return 'American Express';
  }

  // Mastercard: 51-55 or 2221-2720, length 16
  if (len === 16) {
    const prefix2 = Number(digits.slice(0, 2));
    const prefix4 = Number(digits.slice(0, 4));
    if ((prefix2 >= 51 && prefix2 <= 55) || (prefix4 >= 2221 && prefix4 <= 2720)) {
      return 'Mastercard';
    }
  }

  // Diners Club: 300-305, 3095, 36, 38, 39 (14 or 16 digits)
  if ((len === 14 || len === 16) && /^3(?:0[0-5]|095|[689]\d)/.test(digits)) {
    return 'Diners Club';
  }

  // RuPay: common BIN prefixes 508, 60 (excl 6011), 6521-6522, 81, 82, 353, 356 (16 digits)
  if (len === 16) {
    if (
      /^(?:60|81|82|508|6521|6522|353|356)/.test(digits) &&
      !/^6011/.test(digits)
    ) {
      return 'RuPay';
    }
  }

  // JCB: 3528-3589 (16-19 digits)
  if (len >= 16 && len <= 19) {
    const prefix4 = Number(digits.slice(0, 4));
    if (prefix4 >= 3528 && prefix4 <= 3589) {
      return 'JCB';
    }
  }

  // Discover: 6011, 644-649, 65 (16 or 19 digits)
  if ((len === 16 || len === 19) && /^(?:6011|64[4-9]|65)/.test(digits)) {
    return 'Discover';
  }

  // Maestro: 5018, 5020, 5038, 5893, 6304, 6759, 6761-6763 (13-19 digits)
  if (len >= 13 && len <= 19 && /^(?:5018|5020|5038|5893|6304|6759|676[1-3])/.test(digits)) {
    return 'Maestro';
  }

  // UnionPay: 62 (16-19 digits)
  if (len >= 16 && len <= 19 && /^62/.test(digits)) {
    return 'UnionPay';
  }

  return null;
}

/**
 * Validates that an IPv4 string has four decimal octets strictly within 0..255
 * without non-zero leading padding (e.g. rejects 01 or 299).
 */
export function isValidIpv4(candidate: string): boolean {
  const parts = candidate.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return false;
    if (part.length > 1 && part.startsWith('0')) return false;
    const value = Number(part);
    if (value < 0 || value > 255) return false;
  }
  return true;
}

/**
 * Validates standard, compressed (::), and IPv4-embedded IPv6 address syntax.
 */
export function isValidIpv6(candidate: string): boolean {
  if (!candidate || !candidate.includes(':') || !/[0-9A-Fa-f]/.test(candidate)) {
    return false;
  }
  const doubleColonParts = candidate.split('::');
  if (doubleColonParts.length > 2) return false;

  const hasCompression = doubleColonParts.length === 2;
  const left = doubleColonParts[0] ? doubleColonParts[0].split(':') : [];
  const right = hasCompression && doubleColonParts[1] ? doubleColonParts[1].split(':') : [];

  const allSegments = [...left, ...right];
  if (allSegments.some((s) => s.length === 0)) return false;

  let hextetCount = 0;
  for (let i = 0; i < allSegments.length; i++) {
    const seg = allSegments[i];
    const isLastRight = i === allSegments.length - 1;
    if (isLastRight && seg.includes('.')) {
      if (!isValidIpv4(seg)) return false;
      hextetCount += 2;
    } else if (/^[0-9A-Fa-f]{1,4}$/.test(seg)) {
      hextetCount += 1;
    } else {
      return false;
    }
  }

  if (hasCompression) {
    return hextetCount < 8;
  }
  return hextetCount === 8;
}

/**
 * Produces a non-sensitive safe label for audit logs, tooltips, and notifications.
 * Never exposes the complete detected value.
 */
export function createSafeLabel(category: EntityCategory, raw: string): string {
  switch (category) {
    case 'EMAIL': {
      const atIdx = raw.indexOf('@');
      if (atIdx <= 0) return '***@***';
      const local = raw.slice(0, atIdx);
      const domain = raw.slice(atIdx + 1);
      const dotIdx = domain.lastIndexOf('.');
      const maskedLocal = `${local[0]}***`;
      if (dotIdx > 0) {
        const tld = domain.slice(dotIdx);
        return `${maskedLocal}@${domain[0]}***${tld}`;
      }
      return `${maskedLocal}@***`;
    }
    case 'IN_PHONE': {
      const digits = raw.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      return `••••••${last4}`;
    }
    case 'INTL_PHONE': {
      const digits = raw.replace(/\D/g, '');
      const cc = digits.slice(0, 2);
      const last4 = digits.slice(-4);
      return `+${cc} •••••${last4}`;
    }
    case 'IPV4': {
      const parts = raw.split('.');
      if (parts.length !== 4) return '•••.•••.•••.•••';
      return `${parts[0]}.•••.•••.${parts[3]}`;
    }
    case 'IPV6': {
      const parts = raw.split(':').filter(Boolean);
      const head = parts[0] ?? '••••';
      const tail = parts[parts.length - 1] ?? '••••';
      return `${head}:••••:••••:${tail}`;
    }
    case 'PAN': {
      return `${raw.slice(0, 2)}••••••${raw.slice(-2)}`;
    }
    case 'AADHAAR': {
      const digits = raw.replace(/\D/g, '');
      return `•••• •••• ${digits.slice(-4)}`;
    }
    case 'PAYMENT_CARD': {
      const digits = raw.replace(/\D/g, '');
      return `•••• •••• ${digits.slice(-4)}`;
    }
  }
}
