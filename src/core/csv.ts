import type { CsvParseResult } from './types';

const DELIMITERS: Array<',' | ';' | '\t'> = [',', ';', '\t'];

/**
 * Detects the dominant CSV delimiter from the first few non-empty lines,
 * ignoring delimiters enclosed within double quotes.
 */
function detectDelimiter(text: string): ',' | ';' | '\t' {
  const sampleLines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0).slice(0, 5);
  if (sampleLines.length === 0) return ',';

  let bestDelimiter: ',' | ';' | '\t' = ',';
  let bestScore = -1;

  for (const delim of DELIMITERS) {
    let total = 0;
    for (const line of sampleLines) {
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (!inQuotes && ch === delim) {
          total++;
        }
      }
    }
    if (total > bestScore) {
      bestScore = total;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Parses CSV strictly while preserving cell contents and diagnosing malformed syntax
 * (e.g., unclosed quotes, unexpected characters after a closing quote, or ragged rows).
 */
export function parseCsvDocument(text: string): CsvParseResult {
  const lineEnding: '\r\n' | '\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const delimiter = detectDelimiter(text);
  const issues: string[] = [];

  if (text.includes('\0')) {
    issues.push('File contains null bytes and cannot be parsed safely as CSV text.');
    return {
      isCsv: true,
      valid: false,
      delimiter,
      lineEnding,
      columnCount: 0,
      rowCount: 0,
      rows: [],
      issues,
    };
  }

  if (text.trim().length === 0) {
    issues.push('CSV file is empty.');
    return {
      isCsv: true,
      valid: false,
      delimiter,
      lineEnding,
      columnCount: 0,
      rowCount: 0,
      rows: [],
      issues,
    };
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let fieldStartedQuoted = false;
  let justClosedQuote = false;
  let lineNumber = 1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        if (ch === '\n') lineNumber++;
        currentField += ch;
      }
      continue;
    }

    if (justClosedQuote) {
      if (ch === delimiter) {
        currentRow.push(currentField);
        currentField = '';
        fieldStartedQuoted = false;
        justClosedQuote = false;
        continue;
      }
      if (ch === '\r' && text[i + 1] === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        fieldStartedQuoted = false;
        justClosedQuote = false;
        lineNumber++;
        i++;
        continue;
      }
      if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        fieldStartedQuoted = false;
        justClosedQuote = false;
        lineNumber++;
        continue;
      }
      issues.push(`Line ${lineNumber}: unexpected character "${ch}" after closing quote.`);
      justClosedQuote = false;
      currentField += ch;
      continue;
    }

    if (ch === '"' && currentField.length === 0 && !fieldStartedQuoted) {
      inQuotes = true;
      fieldStartedQuoted = true;
      continue;
    }

    if (ch === '"') {
      issues.push(`Line ${lineNumber}: unescaped quote inside unquoted field.`);
      currentField += ch;
      continue;
    }

    if (ch === delimiter) {
      currentRow.push(currentField);
      currentField = '';
      fieldStartedQuoted = false;
      continue;
    }

    if (ch === '\r' && text[i + 1] === '\n') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      fieldStartedQuoted = false;
      lineNumber++;
      i++;
      continue;
    }

    if (ch === '\n' || ch === '\r') {
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      fieldStartedQuoted = false;
      lineNumber++;
      continue;
    }

    currentField += ch;
  }

  if (inQuotes) {
    issues.push(`Line ${lineNumber}: unclosed double-quoted field at end of file.`);
  }

  // Push trailing field/row unless file ended cleanly right after a newline
  if (currentField.length > 0 || currentRow.length > 0 || justClosedQuote) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  const expectedColumns = rows[0]?.length ?? 0;
  const raggedLines: number[] = [];
  rows.forEach((row, idx) => {
    if (row.length !== expectedColumns) {
      raggedLines.push(idx + 1);
    }
  });

  if (raggedLines.length > 0) {
    const preview = raggedLines.slice(0, 4).join(', ');
    const suffix = raggedLines.length > 4 ? ` (+${raggedLines.length - 4} more)` : '';
    issues.push(
      `Inconsistent column count (expected ${expectedColumns} columns based on header; rows ${preview}${suffix} differ).`
    );
  }

  return {
    isCsv: true,
    valid: issues.length === 0,
    delimiter,
    lineEnding,
    columnCount: expectedColumns,
    rowCount: rows.length,
    rows,
    issues,
  };
}

