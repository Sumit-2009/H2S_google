import { describe, expect, it } from 'vitest';
import { detectPiiEntities } from './detector';
import { SAMPLE_CASE_TEXT } from './sampleData';
import { identifyCardNetwork, isValidIpv4, isValidIpv6, isValidLuhn, isValidVerhoeff } from './validators';

describe('validators', () => {
  it('validates Verhoeff checksum accurately', () => {
    expect(isValidVerhoeff('499118665246')).toBe(true);
    expect(isValidVerhoeff('499118665247')).toBe(false);
    expect(isValidVerhoeff('123456789012')).toBe(false);
  });

  it('validates Luhn checksum and card network prefixes', () => {
    expect(isValidLuhn('4532015112830366')).toBe(true);
    expect(identifyCardNetwork('4532015112830366')).toBe('Visa');

    expect(isValidLuhn('5425233430109903')).toBe(true);
    expect(identifyCardNetwork('5425233430109903')).toBe('Mastercard');

    expect(isValidLuhn('6074890012345676')).toBe(true);
    expect(identifyCardNetwork('6074890012345676')).toBe('RuPay');

    expect(isValidLuhn('378282246310005')).toBe(true);
    expect(identifyCardNetwork('378282246310005')).toBe('American Express');

    expect(isValidLuhn('4532015112830367')).toBe(false);
    expect(identifyCardNetwork('9000111122223333')).toBeNull();
  });

  it('validates IPv4 and IPv6 addresses', () => {
    expect(isValidIpv4('192.168.14.22')).toBe(true);
    expect(isValidIpv4('10.0.4.254')).toBe(true);
    expect(isValidIpv4('299.168.0.1')).toBe(false);
    expect(isValidIpv4('172.300.12.4')).toBe(false);
    expect(isValidIpv4('192.168.01.1')).toBe(false);

    expect(isValidIpv6('2001:0db8:85a3::8a2e:0370:7334')).toBe(true);
    expect(isValidIpv6('::1')).toBe(true);
    expect(isValidIpv6('::ffff:192.0.2.128')).toBe(true);
    expect(isValidIpv6('2001::85a3::1')).toBe(false);
    expect(isValidIpv6('::')).toBe(false);
  });
});

describe('detectPiiEntities', () => {
  it('detects all categories in sample case text and rejects invalid candidates', () => {
    const { findings, summary } = detectPiiEntities(SAMPLE_CASE_TEXT);

    expect(summary.byCategory.EMAIL).toBe(3);
    expect(summary.byCategory.IN_PHONE).toBe(4);
    expect(summary.byCategory.IPV4).toBe(2);
    expect(summary.byCategory.PAN).toBe(3);
    expect(summary.byCategory.AADHAAR).toBe(1);
    expect(summary.byCategory.PAYMENT_CARD).toBe(4);
    expect(summary.total).toBe(17);

    expect(summary.rejectedCount).toBeGreaterThanOrEqual(5);

    for (let i = 1; i < findings.length; i++) {
      expect(findings[i].start).toBeGreaterThanOrEqual(findings[i - 1].end);
    }

    for (const f of findings) {
      const raw = SAMPLE_CASE_TEXT.slice(f.start, f.end);
      expect(f.safeLabel).not.toBe(raw);
    }
  });

  it('detects every email in single paragraphs and across separate lines', () => {
    const text = [
      'Send report to alice@example.com, bob.jones@example.org, and carol.smith+work@sub.example.in.',
      'Follow-up: dave@example.co.uk. Also cc eve@example.net.',
      'line1@example.org',
      'line2@example.net',
      'line3@example.invalid',
    ].join('\n');

    const { findings, summary } = detectPiiEntities(text);
    const extracted = findings.map((f) => text.slice(f.start, f.end));

    expect(summary.byCategory.EMAIL).toBe(8);
    expect(summary.total).toBe(8);
    expect(extracted).toEqual([
      'alice@example.com',
      'bob.jones@example.org',
      'carol.smith+work@sub.example.in',
      'dave@example.co.uk',
      'eve@example.net',
      'line1@example.org',
      'line2@example.net',
      'line3@example.invalid',
    ]);
  });

  it('detects contiguous, spaced, and hyphenated payment cards without merging adjacent tokens', () => {
    const text = [
      'Contiguous Visa: 4532015112830366 exp 12/28',
      'Contiguous Amex: 378282246310005 and Mastercard: 5425233430109903',
      'Spaced RuPay: 6074 8900 1234 5676 123',
      'Hyphenated Visa: 4532-0151-1283-0366',
      'Card then phone: 4532015112830366 9820144320',
      'Unrelated 20-digit grouped ID: 4532-0151-1283-0366-9999',
      'Unrelated arbitrary digits: 9000111122223333 and 12345678901234567890',
    ].join('\n');

    const { findings, summary } = detectPiiEntities(text);
    const cards = findings.filter((f) => f.category === 'PAYMENT_CARD');
    const phones = findings.filter((f) => f.category === 'IN_PHONE');

    expect(summary.byCategory.PAYMENT_CARD).toBe(6);
    expect(cards.map((c) => text.slice(c.start, c.end))).toEqual([
      '4532015112830366',
      '378282246310005',
      '5425233430109903',
      '6074 8900 1234 5676',
      '4532-0151-1283-0366',
      '4532015112830366',
    ]);

    expect(phones.map((p) => text.slice(p.start, p.end))).toEqual(['9820144320']);
    expect(summary.byCategory.AADHAAR).toBe(0);
    expect(summary.total).toBe(7);
  });

  it('keeps Luhn-failed candidates honest and opt-in for redaction', () => {
    const text = 'Valid: 4532015112830366 | Bad Luhn: 4532015112830367 | Arbitrary: 9000111122223333';

    const defaultRes = detectPiiEntities(text, { includeFailedLuhnCards: false });
    expect(defaultRes.summary.byCategory.PAYMENT_CARD).toBe(1);
    expect(defaultRes.summary.rejectedCount).toBe(2);
    expect(defaultRes.summary.rejectedNotes.some((r) => r.reason.includes('Failed Luhn checksum'))).toBe(true);

    const optInRes = detectPiiEntities(text, { includeFailedLuhnCards: true });
    expect(optInRes.summary.byCategory.PAYMENT_CARD).toBe(2);
    const failedCard = optInRes.findings.find((f) => f.validationStatus === 'luhn_failed');
    expect(failedCard).toBeDefined();
    expect(failedCard?.validationNote).toContain('FAILED Luhn checksum');
    expect(failedCard?.validationNote).toContain('not a real or verified card');
    expect(optInRes.findings.some((f) => text.slice(f.start, f.end) === '9000111122223333')).toBe(false);
  });

  it('detects IPv6 and international phone numbers while avoiding arbitrary 10-digit false positives', () => {
    const text = [
      'IPv6 primary: 2001:0db8:85a3::8a2e:0370:7334 and loopback ::1',
      'US hotline: +1 (415) 555-0192 | UK desk: +44 20 7946 0958',
      'Dummy zeros: 9000000000 and 8888888888 | Timestamp: 1732700000',
    ].join('\n');

    const { findings, summary } = detectPiiEntities(text);
    expect(summary.byCategory.IPV6).toBe(2);
    expect(summary.byCategory.INTL_PHONE).toBe(2);
    expect(summary.byCategory.IN_PHONE).toBe(0);
    expect(findings.map((f) => text.slice(f.start, f.end))).toEqual([
      '2001:0db8:85a3::8a2e:0370:7334',
      '::1',
      '+1 (415) 555-0192',
      '+44 20 7946 0958',
    ]);
    const usPhone = findings.find((f) => f.category === 'INTL_PHONE');
    expect(usPhone?.safeLabel).toBe('••••••0192');
  });
});
