import { CATEGORY_ORDER } from './categories';
import type {
  DetectionOptions,
  DetectionSummary,
  EntityCategory,
  PiiFinding,
  RejectedCandidate,
} from './types';
import {
  createSafeLabel,
  identifyCardNetwork,
  isValidIpv4,
  isValidIpv6,
  isValidLuhn,
  isValidVerhoeff,
} from './validators';

interface CandidateFinding extends Omit<PiiFinding, 'id'> {
  priority: number;
}

interface RawSpan {
  start: number;
  end: number;
}

const VALID_PAN_HOLDER_TYPES = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

function emptyCategoryCounts(): Record<EntityCategory, number> {
  return {
    EMAIL: 0,
    IN_PHONE: 0,
    INTL_PHONE: 0,
    IPV4: 0,
    IPV6: 0,
    PAN: 0,
    AADHAAR: 0,
    PAYMENT_CARD: 0,
  };
}

function collectEmailCandidates(text: string): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  const regex = /(?<![A-Za-z0-9_%+@\-]|(?:[A-Za-z0-9]\.))([A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,})(?![A-Za-z0-9\-@]|(?:\.[A-Za-z0-9]))/g;

  for (const match of text.matchAll(regex)) {
    const value = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;
    if (value.includes('..')) continue;

    results.push({
      category: 'EMAIL',
      start,
      end: start + value.length,
      safeLabel: createSafeLabel('EMAIL', value),
      validationStatus: 'pattern_match',
      validationNote: 'Email syntax match (deliverability not checked)',
      canonicalKey: `EMAIL:${value.toLowerCase()}`,
      priority: 60,
    });
  }
  return results;
}

function collectIndianPhoneCandidates(text: string): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  const regex = /(?<![0-9A-Za-z+])((?:(?:\+91|91|0)[\s-]?)?[6-9](?:[\s-]?\d){9})(?![0-9A-Za-z])/g;

  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;

    const digits = raw.replace(/\D/g, '');
    const core10 = digits.length > 10 ? digits.slice(-10) : digits;
    if (core10.length !== 10 || !/^[6-9]\d{9}$/.test(core10)) continue;
    if (/^(\d)\1{9}$/.test(core10) || /^[6-9]0{9}$/.test(core10)) continue;
    if (digits.length === 11 && !digits.startsWith('0')) continue;
    if (digits.length === 12 && !digits.startsWith('91')) continue;
    if (digits.length !== 10 && digits.length !== 11 && digits.length !== 12) continue;

    const hasExplicitPrefix = raw.startsWith('+91') || raw.startsWith('91') || raw.startsWith('0');

    results.push({
      category: 'IN_PHONE',
      start,
      end: start + raw.length,
      safeLabel: createSafeLabel('IN_PHONE', raw),
      validationStatus: 'pattern_match',
      validationNote: hasExplicitPrefix
        ? 'Indian +91/0 mobile format (subscriber status not verified)'
        : '10-digit Indian mobile pattern (unprefixed; subscriber not verified)',
      canonicalKey: `IN_PHONE:+91${core10}`,
      priority: 30,
    });
  }
  return results;
}

function collectInternationalPhoneCandidates(text: string): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  // Require leading '+' country code (excluding +91 which is handled by IN_PHONE)
  const regex = /(?<![0-9A-Za-z+])(\+(?!91(?:\D|$))[1-9]\d{0,2}[\s.-]?(?:\(\d{1,4}\)|\d{1,4})(?:[\s.-]?\d{2,5}){1,4})(?![0-9A-Za-z])/g;

  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;

    const digits = raw.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) continue;

    results.push({
      category: 'INTL_PHONE',
      start,
      end: start + raw.length,
      safeLabel: createSafeLabel('INTL_PHONE', raw),
      validationStatus: 'pattern_match',
      validationNote: 'International E.164-style phone format (carrier/subscriber not verified)',
      canonicalKey: `INTL_PHONE:+${digits}`,
      priority: 32,
    });
  }
  return results;
}

function collectIpv4Candidates(
  text: string,
  rejected: RejectedCandidate[]
): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  const regex = /(?<![0-9.:A-Fa-f])(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?![0-9.:A-Fa-f])/g;

  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;

    if (!isValidIpv4(raw)) {
      rejected.push({
        category: 'IPV4',
        reason: 'Octet outside 0–255 or invalid leading zero',
        safeSnippet: createSafeLabel('IPV4', raw),
      });
      continue;
    }

    results.push({
      category: 'IPV4',
      start,
      end: start + raw.length,
      safeLabel: createSafeLabel('IPV4', raw),
      validationStatus: 'valid_range',
      validationNote: 'All 4 octets within 0–255 (host status not checked)',
      canonicalKey: `IPV4:${raw}`,
      priority: 40,
    });
  }
  return results;
}

function collectIpv6Candidates(text: string): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  const regex = /(?<![0-9A-Za-z:])((?:[0-9A-Fa-f]{0,4}:){2,7}(?:[0-9A-Fa-f]{0,4}|\d{1,3}(?:\.\d{1,3}){3}))(?![0-9A-Za-z:.])/g;

  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;
    if (!isValidIpv6(raw)) continue;

    results.push({
      category: 'IPV6',
      start,
      end: start + raw.length,
      safeLabel: createSafeLabel('IPV6', raw),
      validationStatus: 'valid_range',
      validationNote: 'Valid IPv6 syntax and group count (host status not checked)',
      canonicalKey: `IPV6:${raw.toLowerCase()}`,
      priority: 42,
    });
  }
  return results;
}

function collectPanCandidates(text: string): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  const regex = /(?<![A-Za-z0-9])([A-Z]{5}[0-9]{4}[A-Z])(?![A-Za-z0-9])/g;

  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;

    const holderCode = raw[3];
    const hasKnownHolder = VALID_PAN_HOLDER_TYPES.has(holderCode);
    const note = hasKnownHolder
      ? `10-char PAN syntax match (holder code '${holderCode}'; ITD issuance not verified)`
      : '10-char PAN syntax match (uncommon 4th-letter code; ITD issuance not verified)';

    results.push({
      category: 'PAN',
      start,
      end: start + raw.length,
      safeLabel: createSafeLabel('PAN', raw),
      validationStatus: 'pattern_match',
      validationNote: note,
      canonicalKey: `PAN:${raw}`,
      priority: 45,
    });
  }
  return results;
}

function collectAadhaarCandidates(
  text: string,
  rejected: RejectedCandidate[],
  reservedCardSpans: RawSpan[]
): CandidateFinding[] {
  const results: CandidateFinding[] = [];
  const regex = /(?<![0-9])(\d{4}[\s-]?\d{4}[\s-]?\d{4})(?![0-9])/g;

  for (const match of text.matchAll(regex)) {
    const raw = match[1];
    const start = match.index ?? -1;
    if (start < 0) continue;
    const end = start + raw.length;

    const sepMatch = raw.match(/[\s-]/g);
    if (sepMatch && sepMatch.length === 1) continue;
    if (sepMatch && sepMatch.length === 2 && sepMatch[0] !== sepMatch[1]) continue;

    if (sepMatch && sepMatch.length === 2) {
      const sep = sepMatch[0];
      const before = text.slice(Math.max(0, start - 5), start);
      const after = text.slice(end, end + 5);
      const sepEsc = sep === '-' ? '-' : '\\s';
      if (new RegExp(`\\d{4}${sepEsc}$`).test(before)) continue;
      if (new RegExp(`^${sepEsc}\\d{3,4}(?!\\d)`).test(after)) continue;
    }
    if (reservedCardSpans.some((c) => start < c.end && end > c.start)) continue;

    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 12) continue;

    if (digits[0] === '0' || digits[0] === '1') {
      rejected.push({
        category: 'AADHAAR',
        reason: '12-digit number starts with 0 or 1 (not valid Aadhaar prefix)',
        safeSnippet: createSafeLabel('AADHAAR', raw),
      });
      continue;
    }

    if (!isValidVerhoeff(digits)) {
      rejected.push({
        category: 'AADHAAR',
        reason: '12-digit candidate failed Verhoeff checksum',
        safeSnippet: createSafeLabel('AADHAAR', raw),
      });
      continue;
    }

    results.push({
      category: 'AADHAAR',
      start,
      end,
      safeLabel: createSafeLabel('AADHAAR', raw),
      validationStatus: 'verhoeff_valid',
      validationNote: 'Verhoeff checksum valid (format check only; not UIDAI-verified)',
      canonicalKey: `AADHAAR:${digits}`,
      priority: 50,
    });
  }
  return results;
}

const CARD_PATTERN_PATTERNS: readonly RegExp[] = [
  /(?<![0-9])(\d{13,19})(?![0-9])/g,
  /(?<![0-9])(\d{4}([\s-])\d{4}\2\d{4}\2\d{4}\2\d{3})(?![0-9])/g,
  /(?<![0-9])(\d{4}([\s-])\d{4}\2\d{4}\2\d{4})(?![0-9])/g,
  /(?<![0-9])(\d{4}([\s-])\d{6}\2\d{6}|\d{4}([\s-])\d{4}\3\d{8}|\d{6}([\s-])\d{4}\4\d{4}\4\d{2}|\d{6}([\s-])\d{10})(?![0-9])/g,
  /(?<![0-9])(\d{4}([\s-])\d{6}\2\d{5}|\d{4}([\s-])\d{5}\3\d{6})(?![0-9])/g,
  /(?<![0-9])(\d{4}([\s-])\d{6}\2\d{4})(?![0-9])/g,
  /(?<![0-9])(\d{4}([\s-])\d{4}\2\d{4}\2\d)(?![0-9])/g,
];

function collectPaymentCardCandidates(
  text: string,
  rejected: RejectedCandidate[],
  options: DetectionOptions
): { findings: CandidateFinding[]; reservedSpans: RawSpan[] } {
  const results: CandidateFinding[] = [];
  const reservedSpans: RawSpan[] = [];
  const seenSpans = new Set<string>();

  for (const pattern of CARD_PATTERN_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const raw = match[1];
      const start = match.index ?? -1;
      if (start < 0) continue;
      const end = start + raw.length;
      const spanKey = `${start}:${end}`;
      if (seenSpans.has(spanKey)) continue;
      seenSpans.add(spanKey);

      const sepMatch = raw.match(/[\s-]/);
      if (sepMatch) {
        const sep = sepMatch[0];
        const before = text.slice(Math.max(0, start - 5), start);
        const after = text.slice(end, end + 6);
        const sepEsc = sep === '-' ? '-' : '\\s';
        if (new RegExp(`\\d{4}${sepEsc}$`).test(before)) continue;
        if (new RegExp(`^${sepEsc}\\d{4}(?!\\d)`).test(after)) continue;
      }

      const digits = raw.replace(/\D/g, '');
      if (digits.length < 13 || digits.length > 19) continue;
      if (/^(\d)\1+$/.test(digits)) continue;

      const network = identifyCardNetwork(digits);
      if (!network) {
        rejected.push({
          category: 'PAYMENT_CARD',
          reason: 'Digit sequence does not match a recognized payment card IIN/length',
          safeSnippet: createSafeLabel('PAYMENT_CARD', raw),
        });
        continue;
      }

      reservedSpans.push({ start, end });

      const luhnValid = isValidLuhn(digits);
      if (!luhnValid) {
        if (options.includeFailedLuhnCards) {
          results.push({
            category: 'PAYMENT_CARD',
            start,
            end,
            safeLabel: createSafeLabel('PAYMENT_CARD', raw),
            validationStatus: 'luhn_failed',
            validationNote: `FAILED Luhn checksum · Possible ${network} candidate only (not a real or verified card)`,
            cardNetwork: network,
            canonicalKey: `CARD_CANDIDATE:${digits}`,
            priority: 52,
          });
        } else {
          rejected.push({
            category: 'PAYMENT_CARD',
            reason: `Failed Luhn checksum · Possible ${network} candidate (not a real or verified card)`,
            safeSnippet: createSafeLabel('PAYMENT_CARD', raw),
          });
        }
        continue;
      }

      results.push({
        category: 'PAYMENT_CARD',
        start,
        end,
        safeLabel: createSafeLabel('PAYMENT_CARD', raw),
        validationStatus: 'luhn_valid',
        validationNote: `Luhn checksum passed · Likely ${network} (not issuer-verified; debit/credit unknown)`,
        cardNetwork: network,
        canonicalKey: `CARD:${digits}`,
        priority: 58,
      });
    }
  }

  return { findings: results, reservedSpans };
}

/**
 * Resolves overlapping candidates deterministically:
 * higher priority first, then longer span, then earlier start.
 */
function resolveOverlaps(candidates: CandidateFinding[]): PiiFinding[] {
  const ranked = [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const lenDiff = (b.end - b.start) - (a.end - a.start);
    if (lenDiff !== 0) return lenDiff;
    if (a.start !== b.start) return a.start - b.start;
    return a.category.localeCompare(b.category);
  });

  const accepted: CandidateFinding[] = [];
  for (const candidate of ranked) {
    const overlaps = accepted.some(
      (existing) => candidate.start < existing.end && candidate.end > existing.start
    );
    if (!overlaps) {
      accepted.push(candidate);
    }
  }

  accepted.sort((a, b) => a.start - b.start);

  return accepted.map(({ priority: _priority, ...rest }, idx) => ({
    ...rest,
    id: `finding-${idx + 1}`,
  }));
}

export interface DetectionResult {
  findings: PiiFinding[];
  summary: DetectionSummary;
}

/**
 * Runs all local PII detectors and checksum/range validators across the source text.
 */
export function detectPiiEntities(
  text: string,
  options: DetectionOptions = {}
): DetectionResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (!text) {
    return {
      findings: [],
      summary: {
        total: 0,
        byCategory: emptyCategoryCounts(),
        rejectedCount: 0,
        rejectedNotes: [],
        processingMs: 0,
      },
    };
  }

  const rejectedNotes: RejectedCandidate[] = [];
  const cardResult = collectPaymentCardCandidates(text, rejectedNotes, options);
  const candidates: CandidateFinding[] = [
    ...collectEmailCandidates(text),
    ...cardResult.findings,
    ...collectAadhaarCandidates(text, rejectedNotes, cardResult.reservedSpans),
    ...collectPanCandidates(text),
    ...collectIpv6Candidates(text),
    ...collectIpv4Candidates(text, rejectedNotes),
    ...collectInternationalPhoneCandidates(text),
    ...collectIndianPhoneCandidates(text),
  ];

  const findings = resolveOverlaps(candidates);
  const byCategory = emptyCategoryCounts();
  for (const finding of findings) {
    byCategory[finding.category] += 1;
  }

  for (const cat of CATEGORY_ORDER) {
    byCategory[cat] = byCategory[cat] ?? 0;
  }

  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    findings,
    summary: {
      total: findings.length,
      byCategory,
      rejectedCount: rejectedNotes.length,
      rejectedNotes,
      processingMs: Math.max(0, Math.round((t1 - t0) * 10) / 10),
    },
  };
}
