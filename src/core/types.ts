export type EntityCategory =
  | 'EMAIL'
  | 'IN_PHONE'
  | 'INTL_PHONE'
  | 'IPV4'
  | 'IPV6'
  | 'PAN'
  | 'AADHAAR'
  | 'PAYMENT_CARD';

export type RedactionMode = 'full' | 'partial' | 'pseudonym' | 'custom';

export type ValidationStatus =
  | 'pattern_match'
  | 'valid_range'
  | 'verhoeff_valid'
  | 'luhn_valid'
  | 'luhn_failed'
  | 'luhn_not_applicable';

export interface DetectionOptions {
  /** When true, card patterns that fail Luhn checksum are included as unverified possible candidates */
  includeFailedLuhnCards?: boolean;
}

export type CardNetwork =
  | 'Visa'
  | 'Mastercard'
  | 'RuPay'
  | 'American Express'
  | 'Discover'
  | 'Diners Club'
  | 'JCB'
  | 'UnionPay'
  | 'Maestro'
  | 'Unknown Network';

export interface PiiFinding {
  id: string;
  category: EntityCategory;
  start: number;
  end: number;
  /** Safe display label only — never the full raw PII value */
  safeLabel: string;
  /** Validation state — distinguishes syntax/checksum from real-world verification */
  validationStatus: ValidationStatus;
  validationNote: string;
  cardNetwork?: CardNetwork;
  /** Deterministic key for consistent pseudonymization and grouping within current doc */
  canonicalKey: string;
}

export interface RedactedSpan {
  findingId: string;
  category: EntityCategory;
  originalStart: number;
  originalEnd: number;
  sanitizedStart: number;
  sanitizedEnd: number;
  replacement: string;
  safeLabel: string;
  validationNote: string;
  actionSummary: string;
}

export interface RejectedCandidate {
  category: EntityCategory;
  reason: string;
  safeSnippet: string;
}

export interface DetectionSummary {
  total: number;
  byCategory: Record<EntityCategory, number>;
  rejectedCount: number;
  rejectedNotes: RejectedCandidate[];
  processingMs: number;
}

export interface CsvCell {
  raw: string;
  value: string;
  quoted: boolean;
  startOffset: number;
  endOffset: number;
}

export interface CsvParseResult {
  isCsv: boolean;
  valid: boolean;
  delimiter: ',' | ';' | '\t';
  lineEnding: '\r\n' | '\n';
  columnCount: number;
  rowCount: number;
  rows: string[][];
  issues: string[];
}

export interface DocumentMeta {
  fileName: string | null;
  fileType: 'text' | 'txt' | 'csv';
  byteSize: number;
  csvState: CsvParseResult | null;
}

export interface StatusNotice {
  id: number;
  tone: 'info' | 'success' | 'warning' | 'error';
  title: string;
  detail?: string;
}
