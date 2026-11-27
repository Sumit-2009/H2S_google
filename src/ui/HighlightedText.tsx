import type { CSSProperties } from 'react';
import { CATEGORY_META } from '../core/categories';
import type { PiiFinding } from '../core/types';

interface HighlightedTextProps {
  text: string;
  findings: PiiFinding[];
  selectedFindingId?: string | null;
  onSelectFinding?: (id: string) => void;
}

export function HighlightedText({
  text,
  findings,
  selectedFindingId,
  onSelectFinding,
}: HighlightedTextProps) {
  if (!text) return null;

  const segments: Array<{
    key: string;
    content: string;
    finding?: PiiFinding;
  }> = [];

  let cursor = 0;
  for (const finding of findings) {
    if (finding.start > cursor) {
      segments.push({
        key: `plain-${cursor}`,
        content: text.slice(cursor, finding.start),
      });
    }
    segments.push({
      key: finding.id,
      content: text.slice(finding.start, finding.end),
      finding,
    });
    cursor = finding.end;
  }

  if (cursor < text.length) {
    segments.push({
      key: `plain-${cursor}`,
      content: text.slice(cursor),
    });
  }

  return (
    <>
      {segments.map((seg) => {
        if (!seg.finding) {
          return <span key={seg.key}>{seg.content}</span>;
        }
        const meta = CATEGORY_META[seg.finding.category];
        const isSelected = seg.finding.id === selectedFindingId;
        const style = {
          '--mark-color': meta.colorVar,
          '--mark-bg': meta.bgVar,
        } as CSSProperties;

        const isUncertain = seg.finding.validationStatus === 'luhn_failed';
        return (
          <mark
            key={seg.key}
            className={`pii-mark ${isSelected ? 'is-selected' : ''}`}
            style={style}
            title={`${meta.label} (${seg.finding.safeLabel}) — ${seg.finding.validationNote}`}
            onClick={() => onSelectFinding?.(seg.finding!.id)}
          >
            <span className="pii-mark-tag">{isUncertain ? `${meta.shortTag}?` : meta.shortTag}</span>
            {seg.content}
          </mark>
        );
      })}
    </>
  );
}

