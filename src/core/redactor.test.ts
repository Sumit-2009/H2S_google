import { describe, expect, it } from 'vitest';
import { parseCsvDocument } from './csv';
import { detectPiiEntities } from './detector';
import { applyRedaction, validateCustomMask } from './redactor';
import { SAMPLE_CASE_TEXT, SAMPLE_CSV_TEXT } from './sampleData';

describe('redactor', () => {
  it('validates custom mask inputs safely', () => {
    expect(validateCustomMask('[MASK]').valid).toBe(true);
    expect(validateCustomMask('   ').valid).toBe(false);
    expect(validateCustomMask('bad,mask').valid).toBe(false);
    expect(validateCustomMask('=CMD()').valid).toBe(false);
    expect(validateCustomMask('line1\nline2').valid).toBe(false);
  });

  it('applies full, partial, and consistent pseudonymization cleanly', () => {
    const { findings } = detectPiiEntities(SAMPLE_CASE_TEXT);

    const fullRes = applyRedaction(SAMPLE_CASE_TEXT, findings, 'full', '[REDACTED]');
    expect(fullRes.sanitizedText).toContain('[REDACTED]');
    expect(fullRes.sanitizedText).not.toContain('meera.nair@example.invalid');
    expect(fullRes.sanitizedText).not.toContain('4991 1866 5246');
    expect(fullRes.sanitizedText).not.toContain('4532 0151 1283 0366');
    expect(fullRes.sanitizedText).toContain('299.168.0.1');
    expect(fullRes.sanitizedText).toContain('4991 1866 5247');
    expect(fullRes.sanitizedText).toContain('4532 0151 1283 0367');

    const partialRes = applyRedaction(SAMPLE_CASE_TEXT, findings, 'partial', '[REDACTED]');
    expect(partialRes.sanitizedText).toContain('•••• •••• 5246');
    expect(partialRes.sanitizedText).toContain('•••• •••• •••• 0366');
    expect(partialRes.sanitizedText).not.toContain('4991 1866 5246');

    const pseudoRes = applyRedaction(SAMPLE_CASE_TEXT, findings, 'pseudonym', '[REDACTED]');
    const emailMatches = pseudoRes.sanitizedText.match(/\[EMAIL_1\]/g) ?? [];
    expect(emailMatches.length).toBe(2);
    expect(pseudoRes.sanitizedText).toContain('[EMAIL_2]');
    const phoneMatches = pseudoRes.sanitizedText.match(/\[PHONE_1\]/g) ?? [];
    expect(phoneMatches.length).toBe(2);
    const panMatches = pseudoRes.sanitizedText.match(/\[PAN_1\]/g) ?? [];
    expect(panMatches.length).toBe(2);
  });

  it('preserves CSV row and column structure across redaction', () => {
    const { findings } = detectPiiEntities(SAMPLE_CSV_TEXT);
    const res = applyRedaction(SAMPLE_CSV_TEXT, findings, 'pseudonym', '[REDACTED]');
    const origCsv = parseCsvDocument(SAMPLE_CSV_TEXT);
    const sanCsv = parseCsvDocument(res.sanitizedText);

    expect(sanCsv.valid).toBe(true);
    expect(sanCsv.rowCount).toBe(origCsv.rowCount);
    expect(sanCsv.columnCount).toBe(origCsv.columnCount);
  });

  it('redacts multiple emails and contiguous/separated cards accurately and labels Luhn-failed candidates honestly', () => {
    const text = [
      'Emails: alice@example.com, bob@example.org, and carol+1@example.net.',
      'Contiguous card: 4532015112830366',
      'Spaced card: 5425 2334 3010 9903',
      'Failed Luhn candidate: 4532015112830367',
      'Unrelated digits: 9000111122223333',
    ].join('\n');

    const defaultDet = detectPiiEntities(text, { includeFailedLuhnCards: false });
    const defaultRed = applyRedaction(text, defaultDet.findings, 'pseudonym', '[REDACTED]');
    expect(defaultRed.sanitizedText).toContain('[EMAIL_1], [EMAIL_2], and [EMAIL_3].');
    expect(defaultRed.sanitizedText).toContain('Contiguous card: [CARD_1]');
    expect(defaultRed.sanitizedText).toContain('Spaced card: [CARD_2]');
    expect(defaultRed.sanitizedText).toContain('4532015112830367');
    expect(defaultRed.sanitizedText).toContain('9000111122223333');

    const optInDet = detectPiiEntities(text, { includeFailedLuhnCards: true });
    const optInRed = applyRedaction(text, optInDet.findings, 'pseudonym', '[REDACTED]');
    expect(optInRed.sanitizedText).not.toContain('4532015112830367');
    expect(optInRed.sanitizedText).toContain('[CARD_CANDIDATE_3]');
    expect(optInRed.sanitizedText).toContain('9000111122223333');
  });

  it('supports full, custom, and partial modes cleanly', () => {
    const text = 'Contact rahul@example.com or +1 (415) 555-0192';
    const { findings } = detectPiiEntities(text);

    const full = applyRedaction(text, findings, 'full', '[PRIVATE DATA]');
    expect(full.sanitizedText).toBe('Contact [REDACTED] or [REDACTED]');

    const custom = applyRedaction(text, findings, 'custom', '[PRIVATE DATA]');
    expect(custom.sanitizedText).toBe('Contact [PRIVATE DATA] or [PRIVATE DATA]');

    const partial = applyRedaction(text, findings, 'partial', '[PRIVATE DATA]');
    expect(partial.sanitizedText).toContain('ra•••@example.com');
  });
});
