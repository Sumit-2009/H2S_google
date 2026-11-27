import { CATEGORY_META } from './categories';
import type { EntityCategory, PiiFinding, RedactedSpan, RedactionMode } from './types';

export const DEFAULT_CUSTOM_MASK = '[REDACTED]';

export interface MaskValidationResult {
  valid: boolean;
  sanitizedMask: string;
  error: string | null;
}

/**
 * Validates user-supplied custom replacement placeholder for mask modes.
 * Disallows empty strings, newlines, quotes, CSV delimiters, and formula prefixes.
 */
export function validateCustomMask(input: string): MaskValidationResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      sanitizedMask: DEFAULT_CUSTOM_MASK,
      error: 'Custom placeholder cannot be empty; using [REDACTED].',
    };
  }
  if (trimmed.length > 32) {
    return {
      valid: false,
      sanitizedMask: trimmed.slice(0, 32),
      error: 'Custom placeholder must be 32 characters or fewer.',
    };
  }
  if (/[\r\n",;\t]/.test(trimmed)) {
    return {
      valid: false,
      sanitizedMask: DEFAULT_CUSTOM_MASK,
      error: 'Custom placeholder cannot contain line breaks, quotes, or CSV delimiters (, ; tab).',
    };
  }
  if (/^[=+\-@]/.test(trimmed)) {
    return {
      valid: false,
      sanitizedMask: DEFAULT_CUSTOM_MASK,
      error: 'Custom placeholder cannot start with =, +, -, or @ to prevent spreadsheet formula injection.',
    };
  }
  return {
    valid: true,
    sanitizedMask: trimmed,
    error: null,
  };
}

function partialMaskValue(category: EntityCategory, raw: string, maskChar: string): string {
  const ch = maskChar || '*';
  switch (category) {
    case 'EMAIL': {
      const atIdx = raw.indexOf('@');
      if (atIdx <= 0) return ch.repeat(6);
      const local = raw.slice(0, atIdx);
      const domain = raw.slice(atIdx + 1);
      const keepLen = local.length >= 2 ? 2 : 1;
      return `${local.slice(0, keepLen)}${ch.repeat(3)}@${domain}`;
    }
    case 'IN_PHONE': {
      const digits = raw.replace(/\D/g, '');
      const last2 = digits.slice(-2);
      const prefix = raw.startsWith('+91') ? '+91 ' : '';
      return `${prefix}${ch.repeat(8)}${last2}`;
    }
    case 'INTL_PHONE': {
      const digits = raw.replace(/\D/g, '');
      const cc = digits.slice(0, 2);
      const last2 = digits.slice(-2);
      return `+${cc} ${ch.repeat(Math.max(4, digits.length - 4))}${last2}`;
    }
    case 'IPV4': {
      const parts = raw.split('.');
      if (parts.length !== 4) return ch.repeat(9);
      return `${parts[0]}.${ch.repeat(3)}.${ch.repeat(3)}.${parts[3]}`;
    }
    case 'IPV6': {
      const parts = raw.split(':').filter(Boolean);
      const head = parts[0] ?? '••••';
      const tail = parts[parts.length - 1] ?? '••••';
      return `${head}:${ch.repeat(4)}:${ch.repeat(4)}:${tail}`;
    }
    case 'PAN': {
      return `${raw.slice(0, 2)}${ch.repeat(7)}${raw.slice(-1)}`;
    }
    case 'AADHAAR': {
      const sep = raw.includes('-') ? '-' : raw.includes(' ') ? ' ' : '';
      const digits = raw.replace(/\D/g, '');
      const block = ch.repeat(4);
      return `${block}${sep}${block}${sep}${digits.slice(-4)}`;
    }
    case 'PAYMENT_CARD': {
      const sep = raw.includes('-') ? '-' : raw.includes(' ') ? ' ' : '';
      const digits = raw.replace(/\D/g, '');
      const last4 = digits.slice(-4);
      if (digits.length === 15) {
        return `${ch.repeat(4)}${sep}${ch.repeat(6)}${sep}${ch}${last4}`;
      }
      const block = ch.repeat(4);
      return `${block}${sep}${block}${sep}${block}${sep}${last4}`;
    }
  }
}

function chooseMaskChar(customMask: string): string {
  const cleaned = customMask.replace(/[\[\]\s]/g, '');
  if (cleaned.length === 1) return cleaned;
  return '•';
}

export interface RedactionResult {
  sanitizedText: string;
  spans: RedactedSpan[];
  uniquePseudonymCount: number;
}

/**
 * Deterministically redacts detected spans from original offsets,
 * preserving surrounding whitespace, punctuation, line breaks, and CSV structure.
 */
export function applyRedaction(
  sourceText: string,
  findings: PiiFinding[],
  mode: RedactionMode,
  customMask: string
): RedactionResult {
  if (!sourceText || findings.length === 0) {
    return {
      sanitizedText: sourceText,
      spans: [],
      uniquePseudonymCount: 0,
    };
  }

  const maskValidation = validateCustomMask(customMask);
  const safeCustomMask = maskValidation.sanitizedMask;
  const partialMaskChar = chooseMaskChar(customMask);

  const categoryCounters: Record<EntityCategory, number> = {
    EMAIL: 0,
    IN_PHONE: 0,
    INTL_PHONE: 0,
    IPV4: 0,
    IPV6: 0,
    PAN: 0,
    AADHAAR: 0,
    PAYMENT_CARD: 0,
  };
  const pseudonymMap = new Map<string, string>();

  let output = '';
  let cursor = 0;
  const spans: RedactedSpan[] = [];

  for (const finding of findings) {
    if (finding.start < cursor || finding.end > sourceText.length) {
      continue;
    }

    output += sourceText.slice(cursor, finding.start);
    const rawValue = sourceText.slice(finding.start, finding.end);

    let replacement = DEFAULT_CUSTOM_MASK;
    let actionSummary =
      finding.validationStatus === 'luhn_failed'
        ? `Possible candidate · Full mask (${DEFAULT_CUSTOM_MASK})`
        : `Full mask (${DEFAULT_CUSTOM_MASK})`;

    if (mode === 'custom') {
      replacement = safeCustomMask;
      actionSummary =
        finding.validationStatus === 'luhn_failed'
          ? `Possible candidate · Custom (${safeCustomMask})`
          : `Custom (${safeCustomMask})`;
    } else if (mode === 'partial') {
      replacement = partialMaskValue(finding.category, rawValue, partialMaskChar);
      actionSummary =
        finding.validationStatus === 'luhn_failed'
          ? `Possible candidate · Partial mask (${replacement})`
          : `Partial mask (${replacement})`;
    } else if (mode === 'pseudonym') {
      let token = pseudonymMap.get(finding.canonicalKey);
      if (!token) {
        categoryCounters[finding.category] += 1;
        const tag =
          finding.validationStatus === 'luhn_failed'
            ? 'CARD_CANDIDATE'
            : CATEGORY_META[finding.category].shortTag;
        token = `[${tag}_${categoryCounters[finding.category]}]`;
        pseudonymMap.set(finding.canonicalKey, token);
      }
      replacement = token;
      actionSummary =
        finding.validationStatus === 'luhn_failed'
          ? `Possible candidate · Pseudonym (${token})`
          : `Pseudonym (${token})`;
    }

    const sanitizedStart = output.length;
    output += replacement;
    const sanitizedEnd = output.length;

    spans.push({
      findingId: finding.id,
      category: finding.category,
      originalStart: finding.start,
      originalEnd: finding.end,
      sanitizedStart,
      sanitizedEnd,
      replacement,
      safeLabel: finding.safeLabel,
      validationNote: finding.validationNote,
      actionSummary,
    });

    cursor = finding.end;
  }

  if (cursor < sourceText.length) {
    output += sourceText.slice(cursor);
  }

  return {
    sanitizedText: output,
    spans,
    uniquePseudonymCount: pseudonymMap.size,
  };
}
