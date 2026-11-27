import { describe, expect, it } from 'vitest';
import { detectPiiEntities } from './detector';
import {
  buildSafeExportFilename,
  buildSummaryReportText,
  prepareSafeCsvExport,
} from './exporter';
import { applyRedaction } from './redactor';
import { SAMPLE_CSV_TEXT } from './sampleData';

describe('exporter', () => {
  it('neutralizes formula-injection cells in CSV exports without altering safe cells', () => {
    const { findings } = detectPiiEntities(SAMPLE_CSV_TEXT);
    const { sanitizedText } = applyRedaction(SAMPLE_CSV_TEXT, findings, 'pseudonym', '[REDACTED]');
    const prep = prepareSafeCsvExport(sanitizedText);

    expect(prep.validStructure).toBe(true);
    expect(prep.rowCount).toBe(4);
    expect(prep.columnCount).toBe(8);
    expect(prep.neutralizedCount).toBe(1);
    expect(prep.csvContent).toContain("'=SUM(A1:A2) formula test");
    // Ordinary safe cells remain intact
    expect(prep.csvContent).toContain('CASE-101,Aarav Kulkarni,[EMAIL_1]');
  });

  it('builds safe descriptive filenames and PII-free summary reports', () => {
    expect(buildSafeExportFilename('My Evidence (2026).csv', 'sanitized', 'csv')).toBe(
      'privacydesk-my-evidence-2026-sanitized.csv'
    );

    const { findings, summary } = detectPiiEntities(SAMPLE_CSV_TEXT);
    const { spans } = applyRedaction(SAMPLE_CSV_TEXT, findings, 'full', '[REDACTED]');
    const report = buildSummaryReportText({
      docMeta: {
        fileName: 'sample.csv',
        fileType: 'csv',
        byteSize: SAMPLE_CSV_TEXT.length,
        csvState: null,
      },
      summary,
      spans,
      mode: 'full',
      customMask: '[REDACTED]',
      formulaNeutralizedCount: 1,
    });

    expect(report).toContain('Nothing leaves this tab.');
    expect(report).toContain('do NOT prove real-world issuance');
    expect(report).not.toContain('aarav.k@example.invalid');
    expect(report).not.toContain('4991-1866-5246');
    expect(report).not.toContain('4532-0151-1283-0366');
  });
});

