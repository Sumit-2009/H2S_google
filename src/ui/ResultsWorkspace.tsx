import { useRef } from 'react';
import { CATEGORY_META, CATEGORY_ORDER } from '../core/categories';
import type { DetectionSummary, DocumentMeta, PiiFinding, RedactedSpan, RedactionMode } from '../core/types';
import type { MaskValidationResult } from '../core/redactor';
import { HighlightedText } from './HighlightedText';
import { IconCopy, IconDownload } from './Icons';
import { SanitizedText } from './SanitizedText';

interface ResultsWorkspaceProps {
  deferredText: string;
  findings: PiiFinding[];
  summary: DetectionSummary;
  sanitizedText: string;
  spans: RedactedSpan[];
  docMeta: DocumentMeta;
  isDetecting: boolean;
  syncScroll: boolean;
  redactionMode: RedactionMode;
  customMaskInput: string;
  maskValidation: MaskValidationResult;
  includeFailedLuhnCards: boolean;
  selectedFindingId: string | null;
  onSelectFinding: (id: string) => void;
  onChangeMode: (mode: RedactionMode) => void;
  onChangeCustomMask: (mask: string) => void;
  onChangeIncludeFailedLuhn: (checked: boolean) => void;
  onCopySanitized: () => void;
  onExportTxt: () => void;
  onExportCsv: () => void;
}

const MODE_OPTIONS: ReadonlyArray<readonly [RedactionMode, string]> = [
  ['full', 'Full Mask'],
  ['partial', 'Partial Mask'],
  ['pseudonym', 'Consistent Pseudonym'],
  ['custom', 'Custom Placeholder'],
];

export function ResultsWorkspace({
  deferredText,
  findings,
  summary,
  sanitizedText,
  spans,
  docMeta,
  isDetecting,
  syncScroll,
  redactionMode,
  customMaskInput,
  maskValidation,
  includeFailedLuhnCards,
  selectedFindingId,
  onSelectFinding,
  onChangeMode,
  onChangeCustomMask,
  onChangeIncludeFailedLuhn,
  onCopySanitized,
  onExportTxt,
  onExportCsv,
}: ResultsWorkspaceProps) {
  const origPreviewRef = useRef<HTMLDivElement | null>(null);
  const sanPreviewRef = useRef<HTMLPreElement | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);

  const handlePreviewScroll = (source: 'orig' | 'san') => {
    if (!syncScroll || isSyncingScrollRef.current) return;
    const fromEl = source === 'orig' ? origPreviewRef.current : sanPreviewRef.current;
    const toEl = source === 'orig' ? sanPreviewRef.current : origPreviewRef.current;
    if (!fromEl || !toEl) return;

    const fromMax = fromEl.scrollHeight - fromEl.clientHeight;
    const toMax = toEl.scrollHeight - toEl.clientHeight;
    if (fromMax <= 0 || toMax <= 0) return;

    isSyncingScrollRef.current = true;
    toEl.scrollTop = (fromEl.scrollTop / fromMax) * toMax;
    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  const hasText = deferredText.length > 0;

  return (
    <>
      <div className="results-summary-bar">
        <div className="summary-stats">
          <div className="summary-metric">
            <span className="metric-num tabular">{summary.total}</span>
            <span className="metric-label">Total detected</span>
          </div>
          <div className="summary-metric">
            <span className="metric-num tabular" style={{ color: 'var(--status-ok)' }}>
              {spans.length}
            </span>
            <span className="metric-label">Successfully redacted</span>
          </div>
          <div className="summary-metric">
            <span className="metric-num tabular" style={{ color: 'var(--status-warn)' }}>
              {summary.rejectedCount}
            </span>
            <span className="metric-label">Invalid / unverified</span>
          </div>
        </div>

        <div className="input-actions">
          <button
            type="button"
            className="btn"
            onClick={onCopySanitized}
            disabled={!hasText || isDetecting}
          >
            <IconCopy />
            <span>Copy Sanitized</span>
          </button>
          <button
            type="button"
            className="btn"
            onClick={onExportTxt}
            disabled={!hasText || isDetecting}
          >
            <IconDownload />
            <span>Export TXT</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onExportCsv}
            disabled={!hasText || isDetecting || (docMeta.csvState !== null && !docMeta.csvState.valid)}
          >
            <IconDownload />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      <div className="mode-toolbar">
        <div className="segmented-control" role="radiogroup" aria-label="Redaction mode">
          {MODE_OPTIONS.map(([modeValue, modeLabel]) => (
            <button
              key={modeValue}
              type="button"
              role="radio"
              aria-checked={redactionMode === modeValue}
              className={`seg-btn ${redactionMode === modeValue ? 'is-active' : ''}`}
              onClick={() => onChangeMode(modeValue)}
            >
              {modeLabel}
            </button>
          ))}
        </div>

        {redactionMode === 'custom' && (
          <div className="custom-mask-inline">
            <label htmlFor="custom-mask-input" className="sr-only">
              Custom replacement placeholder
            </label>
            <input
              id="custom-mask-input"
              type="text"
              className="inline-input"
              value={customMaskInput}
              maxLength={36}
              onChange={(e) => onChangeCustomMask(e.target.value)}
              placeholder="[PRIVATE DATA]"
              aria-invalid={!maskValidation.valid}
            />
            {maskValidation.error && (
              <span className="inline-error" role="alert">
                {maskValidation.error}
              </span>
            )}
          </div>
        )}

        <label className="setting-row" style={{ alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={includeFailedLuhnCards}
            onChange={(e) => onChangeIncludeFailedLuhn(e.target.checked)}
          />
          <span>Redact failed-Luhn card candidates</span>
        </label>
      </div>

      <div className="comparison-grid">
        <section className="pane-card" aria-label="Original Evidence">
          <div className="pane-head">
            <h2 className="pane-title">Original Evidence</h2>
            <span className="pane-meta tabular">{summary.total} highlighted</span>
          </div>
          <div className="legend-strip" aria-label="Detected entity categories">
            {CATEGORY_ORDER.filter((cat) => summary.byCategory[cat] > 0).map((cat) => {
              const meta = CATEGORY_META[cat];
              return (
                <span key={cat} className="legend-pill tabular">
                  <span
                    className="legend-dot"
                    style={{ backgroundColor: meta.colorVar }}
                    aria-hidden="true"
                  />
                  {meta.shortTag}: {summary.byCategory[cat]}
                </span>
              );
            })}
            {summary.total === 0 && (
              <span className="pane-meta">No matching PII entities detected.</span>
            )}
          </div>
          <div
            ref={origPreviewRef}
            className="pane-scroll"
            onScroll={() => handlePreviewScroll('orig')}
          >
            <HighlightedText
              text={deferredText}
              findings={findings}
              selectedFindingId={selectedFindingId}
              onSelectFinding={onSelectFinding}
            />
          </div>
        </section>

        <section className="pane-card" aria-label="Sanitized Preview">
          <div className="pane-head">
            <h2 className="pane-title">Sanitized Preview</h2>
            <span className="pane-meta tabular">
              {spans.length} redacted · {redactionMode}
            </span>
          </div>
          <pre
            ref={sanPreviewRef}
            className="pane-scroll"
            onScroll={() => handlePreviewScroll('san')}
          >
            <SanitizedText
              text={sanitizedText}
              spans={spans}
              selectedFindingId={selectedFindingId}
              onSelectFinding={onSelectFinding}
            />
          </pre>
        </section>
      </div>
    </>
  );
}

