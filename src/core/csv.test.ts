import { describe, expect, it } from 'vitest';
import { parseCsvDocument } from './csv';

describe('parseCsvDocument', () => {
  it('handles quoted newlines, escaped quotes, and empty trailing fields', () => {
    const csv = 'id,notes,extra\r\n1,"Line one\r\n""quoted"" line",value\r\n2,plain,\r\n';
    const parsed = parseCsvDocument(csv);

    expect(parsed.valid).toBe(true);
    expect(parsed.lineEnding).toBe('\r\n');
    expect(parsed.rowCount).toBe(3);
    expect(parsed.columnCount).toBe(3);
    expect(parsed.rows[1]).toEqual(['1', 'Line one\r\n"quoted" line', 'value']);
    expect(parsed.rows[2]).toEqual(['2', 'plain', '']);
  });

  it('rejects null bytes, unclosed quotes, and ragged column counts', () => {
    expect(parseCsvDocument('a,b\n1,\0').valid).toBe(false);
    expect(parseCsvDocument('a,b\n"unclosed').valid).toBe(false);

    const ragged = parseCsvDocument('a,b,c\n1,2');
    expect(ragged.valid).toBe(false);
    expect(ragged.issues[0]).toContain('Inconsistent column count');
  });
});

