import { CATEGORY_META } from '../core/categories';
import type { RedactedSpan } from '../core/types';

interface SanitizedTextProps {
  text: string;
  spans: RedactedSpan[];
  selectedFindingId?: string | null;
  onSelectFinding?: (id: string) => void;
}

export function SanitizedText({
  text,
  spans,
  selectedFindingId,
  onSelectFinding,
}: SanitizedTextProps) {
  if (!text) return null;

  const segments: Array<{
    key: string;
    content: string;
    span?: RedactedSpan;
  }> = [];

  let cursor = 0;
  for (const span of spans) {
    if (span.sanitizedStart > cursor) {
      segments.push({
        key: `clean-${cursor}`,
        content: text.slice(cursor, span.sanitizedStart),
      });
    }
    segments.push({
      key: `red-${span.findingId}`,
      content: text.slice(span.sanitizedStart, span.sanitizedEnd),
      span,
    });
    cursor = span.sanitizedEnd;
  }

  if (cursor < text.length) {
    segments.push({
      key: `clean-${cursor}`,
      content: text.slice(cursor),
    });
  }

  return (
    <>
      {segments.map((seg) => {
        if (!seg.span) {
          return <span key={seg.key}>{seg.content}</span>;
        }
        const meta = CATEGORY_META[seg.span.category];
        const isSelected = seg.span.findingId === selectedFindingId;
        return (
          <mark
            key={seg.key}
            className={`redaction-mark ${isSelected ? 'is-selected' : ''}`}
            title={`${meta.label} · ${seg.span.actionSummary}`}
            onClick={() => onSelectFinding?.(seg.span!.findingId)}
          >
            {seg.content}
          </mark>
        );
      })}
    </>
  );
}

