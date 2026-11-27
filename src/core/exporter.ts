import { CATEGORY_META, CATEGORY_ORDER } from './categories';
import { parseCsvDocument } from './csv';
import type { DetectionSummary, DocumentMeta, RedactedSpan, RedactionMode } from './types';

const FORMULA_TRIGGER_RE = /^[=+\-@\t\r]/;

export interface CsvExportPrep {
  csvContent: string;
  neutralizedCount: number;
  rowCount: number;
  columnCount: number;
  validStructure: boolean;
}

/**
 * Serializes a single CSV field using standard RFC 4180 quoting when needed.
 */
function serializeCsvField(value: string, delimiter: string): string {
  const mustQuote =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');
  if (!mustQuote) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Neutralizes spreadsheet formula injection in sanitized CSV cells by prefixing
 * leading formula triggers (=, +, -, @, tab, CR) with a single quote (').
 * Ordinary safe values remain completely unchanged.
 */
export function prepareSafeCsvExport(
  sanitizedText: string,
  preferredDelimiter?: ',' | ';' | '\t',
  preferredLineEnding?: '\r\n' | '\n'
): CsvExportPrep {
  const parsed = parseCsvDocument(sanitizedText);
  const delimiter = preferredDelimiter ?? parsed.delimiter;
  const lineEnding = preferredLineEnding ?? parsed.lineEnding;

  let neutralizedCount = 0;

  if (parsed.rows.length === 0) {
    return {
      csvContent: sanitizedText,
      neutralizedCount: 0,
      rowCount: 0,
      columnCount: 0,
      validStructure: parsed.valid,
    };
  }

  const safeRows = parsed.rows.map((row) =>
    row.map((cell) => {
      let safeCell = cell;
      if (FORMULA_TRIGGER_RE.test(cell)) {
        safeCell = `'${cell}`;
        neutralizedCount += 1;
      }
      return serializeCsvField(safeCell, delimiter);
    })
  );

  return {
    csvContent: safeRows.map((row) => row.join(delimiter)).join(lineEnding),
    neutralizedCount,
    rowCount: parsed.rowCount,
    columnCount: parsed.columnCount,
    validStructure: parsed.valid,
  };
}

/**
 * Builds a safe, descriptive export filename without path traversal or unsafe characters.
 */
export function buildSafeExportFilename(
  originalName: string | null,
  suffix: 'sanitized' | 'summary-report',
  extension: 'txt' | 'csv'
): string {
  const rawBase = originalName ? originalName.replace(/\.[^.]+$/, '') : 'case-notes';
  const cleanBase = rawBase
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'case-notes';

  return `privacydesk-${cleanBase}-${suffix}.${extension}`;
}

/**
 * Builds a concise, PII-free summary & audit report suitable for download.
 */
export function buildSummaryReportText(params: {
  docMeta: DocumentMeta;
  summary: DetectionSummary;
  spans: RedactedSpan[];
  mode: RedactionMode;
  customMask: string;
  formulaNeutralizedCount?: number;
}): string {
  const { docMeta, summary, spans, mode, customMask, formulaNeutralizedCount } = params;
  const lines: string[] = [
    'PrivacyDesk — LOCAL SANITIZATION SUMMARY REPORT',
    '================================================',
    `Source label        : ${docMeta.fileName ?? 'Direct pasted text'}`,
    `Input format        : ${docMeta.fileType.toUpperCase()}`,
    `Processing mode     : Local browser session (Nothing leaves this tab.)`,
    `Redaction mode      : ${mode.toUpperCase()}${mode === 'pseudonym' ? '' : ` (placeholder: ${customMask})`}`,
    `Total findings      : ${summary.total}`,
    `Rejected candidates : ${summary.rejectedCount}`,
    '',
    'CATEGORY BREAKDOWN',
    '------------------',
  ];

  for (const cat of CATEGORY_ORDER) {
    const meta = CATEGORY_META[cat];
    lines.push(`${meta.label.padEnd(20, ' ')}: ${summary.byCategory[cat]}`);
  }

  lines.push(
    '',
    'VALIDATION & PRIVACY CAVEATS',
    '----------------------------',
    '- Format matches, IPv4 0-255 bounds, Aadhaar Verhoeff checksums, and card Luhn checksums',
    '  do NOT prove real-world issuance, ownership, identity, account status, or transactability.',
    '- Card detections are categorized strictly as PAYMENT_CARD (debit vs. credit is not inferred).',
    '- No complete sensitive values are included in this report or in application logs.'
  );

  if (typeof formulaNeutralizedCount === 'number' && formulaNeutralizedCount > 0) {
    lines.push(
      `- CSV formula-injection defense neutralized ${formulaNeutralizedCount} cell(s) starting with =, +, -, @, tab, or CR using a leading apostrophe (').`
    );
  }

  lines.push('', 'ENTITY AUDIT LOG (SAFE LABELS ONLY)', '-----------------------------------');

  if (spans.length === 0) {
    lines.push('No entities redacted.');
  } else {
    spans.forEach((span, index) => {
      lines.push(
        `${String(index + 1).padStart(3, '0')}. [${CATEGORY_META[span.category].shortTag}] ${span.safeLabel} -> ${span.actionSummary} | ${span.validationNote}`
      );
    });
  }

  return lines.join('\n');
}

