import { CATEGORY_META } from '../core/categories';
import { DEVELOPMENT_HISTORY, IMPLEMENTED_FEATURES } from '../core/devHistory';
import type { DetectionSummary, RedactedSpan, RedactionMode } from '../core/types';
import { IconCheck, IconChevronDown, IconDownload } from './Icons';

export type ForensicTab = 'audit' | 'summary' | 'history';

interface ForensicPanelProps {
  open: boolean;
  onToggleOpen: () => void;
  activeTab: ForensicTab;
  onChangeTab: (tab: ForensicTab) => void;
  spans: RedactedSpan[];
  summary: DetectionSummary;
  redactionMode: RedactionMode;
  uniquePseudonymCount: number;
  selectedFindingId: string | null;
  canExportReport: boolean;
  onExportSummaryReport: () => void;
}

export function ForensicPanel({
  open,
  onToggleOpen,
  activeTab,
  onChangeTab,
  spans,
  summary,
  redactionMode,
  uniquePseudonymCount,
  selectedFindingId,
  canExportReport,
  onExportSummaryReport,
}: ForensicPanelProps) {
  return (
    <section className="forensic-panel" aria-label="Audit and forensic details">
      <button
        type="button"
        className="forensic-toggle"
        onClick={onToggleOpen}
        aria-expanded={open}
        aria-controls="forensic-drawer-body"
      >
        <span>
          Forensic &amp; Audit Details ({spans.length} entities · {summary.rejectedCount} filtered)
        </span>
        <IconChevronDown
          style={{
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--transition-fast)',
          }}
        />
      </button>

      {open && (
        <div id="forensic-drawer-body" className="forensic-body">
          <div className="mode-toolbar">
            <div className="segmented-control" role="tablist" aria-label="Forensic tabs">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'audit'}
                className={`seg-btn ${activeTab === 'audit' ? 'is-active' : ''}`}
                onClick={() => onChangeTab('audit')}
              >
                Audit ({spans.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'summary'}
                className={`seg-btn ${activeTab === 'summary' ? 'is-active' : ''}`}
                onClick={() => onChangeTab('summary')}
              >
                Summary
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'history'}
                className={`seg-btn ${activeTab === 'history' ? 'is-active' : ''}`}
                onClick={() => onChangeTab('history')}
              >
                History
              </button>
            </div>

            {activeTab === 'summary' && (
              <button
                type="button"
                className="btn"
                onClick={onExportSummaryReport}
                disabled={!canExportReport}
              >
                <IconDownload />
                <span>Export Summary Report</span>
              </button>
            )}
          </div>

          {activeTab === 'audit' && (
            <>
              {spans.length === 0 ? (
                <p className="audit-note">No entities redacted in the current text.</p>
              ) : (
                <div className="audit-grid">
                  {spans.map((span) => {
                    const meta = CATEGORY_META[span.category];
                    return (
                      <div
                        key={span.findingId}
                        className={`audit-card ${selectedFindingId === span.findingId ? 'is-selected' : ''}`}
                      >
                        <div className="audit-card-head">
                          <span
                            className="audit-badge"
                            style={{
                              backgroundColor: meta.bgVar,
                              color: meta.colorVar,
                            }}
                          >
                            {meta.shortTag}
                          </span>
                          <span className="tabular" style={{ color: 'var(--ink-muted)' }}>
                            [{span.originalStart}..{span.originalEnd}]
                          </span>
                        </div>
                        <div className="audit-safe-val">{span.safeLabel}</div>
                        <div className="audit-note">{span.actionSummary}</div>
                        <div className="audit-note">{span.validationNote}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {summary.rejectedNotes.length > 0 && (
                <>
                  <strong style={{ fontSize: '0.8125rem' }}>
                    Filtered / Unverified Candidates ({summary.rejectedCount})
                  </strong>
                  <div className="audit-grid">
                    {summary.rejectedNotes.map((rej, idx) => (
                      <div key={`rej-${idx}`} className="audit-card">
                        <div className="audit-card-head">
                          <span>{CATEGORY_META[rej.category].shortTag}</span>
                          <span>{rej.safeSnippet}</span>
                        </div>
                        <div className="audit-note">{rej.reason}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'summary' && (
            <>
              <div className="audit-grid">
                <div className="audit-card">
                  <span className="metric-label">Processing Time</span>
                  <strong className="mono tabular">
                    {summary.processingMs} ms (Local browser tab)
                  </strong>
                </div>
                <div className="audit-card">
                  <span className="metric-label">Active Redaction Mode</span>
                  <strong className="mono">{redactionMode.toUpperCase()}</strong>
                </div>
                <div className="audit-card">
                  <span className="metric-label">Unique Pseudonyms</span>
                  <strong className="mono tabular">
                    {uniquePseudonymCount} (Session RAM only)
                  </strong>
                </div>
              </div>

              <div className="caveat-box">
                <strong>Validation Caveats:</strong> Format matches, IPv4/IPv6 syntax checks,
                Aadhaar Verhoeff checksums (non-Luhn), and card Luhn checksums do not prove
                real-world issuance, ownership, identity, or active account status.
              </div>

              <div className="caveat-box">
                <strong>CSV Formula Protection:</strong> On CSV export, cells starting with{' '}
                <code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>, tab, or CR (including
                leading whitespace before triggers) are neutralized with a leading apostrophe (
                <code>'</code>) while keeping ordinary safe cells untouched.
              </div>
            </>
          )}

          {activeTab === 'history' && (
            <>
              <div className="audit-grid">
                {DEVELOPMENT_HISTORY.map((entry) => (
                  <div key={entry.stage} className="audit-card">
                    <div className="audit-card-head">
                      <strong>{entry.stage}</strong>
                      <span style={{ color: 'var(--status-ok)' }}>
                        {entry.status.toUpperCase()}
                      </span>
                    </div>
                    <strong>{entry.title}</strong>
                    <div className="audit-note">{entry.notes}</div>
                  </div>
                ))}
              </div>

              <ul className="checklist">
                {IMPLEMENTED_FEATURES.map((item) => (
                  <li key={item.id} className="checklist-item">
                    <IconCheck style={{ color: 'var(--status-ok)', flexShrink: 0 }} />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  );
}

