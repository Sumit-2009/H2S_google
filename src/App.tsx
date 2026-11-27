import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { CATEGORY_META, CATEGORY_ORDER } from './core/categories';
import { parseCsvDocument } from './core/csv';
import { DEVELOPMENT_HISTORY, IMPLEMENTED_FEATURES } from './core/devHistory';
import { detectPiiEntities } from './core/detector';
import {
  buildSafeExportFilename,
  buildSummaryReportText,
  prepareSafeCsvExport,
} from './core/exporter';
import { applyRedaction, DEFAULT_CUSTOM_MASK, validateCustomMask } from './core/redactor';
import { SAMPLE_CASE_TEXT, SAMPLE_CSV_TEXT } from './core/sampleData';
import type { DocumentMeta, RedactionMode, StatusNotice } from './core/types';
import { HighlightedText } from './ui/HighlightedText';
import {
  BrandDocMark,
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFileText,
  IconMoon,
  IconSearch,
  IconSettings,
  IconSun,
  IconTrash,
  IconUpload,
} from './ui/Icons';
import { SanitizedText } from './ui/SanitizedText';

type ThemeMode = 'light' | 'dark';
type ForensicTab = 'audit' | 'summary' | 'history';

const EMPTY_META: DocumentMeta = {
  fileName: null,
  fileType: 'text',
  byteSize: 0,
  csvState: null,
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  const [theme, setTheme] = useState<ThemeMode>('light');
  const [sourceText, setSourceText] = useState<string>('');
  const [docMeta, setDocMeta] = useState<DocumentMeta>(EMPTY_META);

  const [hasAnalyzed, setHasAnalyzed] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  const [redactionMode, setRedactionMode] = useState<RedactionMode>('full');
  const [customMaskInput, setCustomMaskInput] = useState<string>('[PRIVATE DATA]');
  const [includeFailedLuhnCards, setIncludeFailedLuhnCards] = useState<boolean>(false);
  const [syncScroll, setSyncScroll] = useState<boolean>(true);

  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [forensicOpen, setForensicOpen] = useState<boolean>(false);
  const [forensicTab, setForensicTab] = useState<ForensicTab>('audit');

  const [notice, setNotice] = useState<StatusNotice | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [lastFormulaNeutralized, setLastFormulaNeutralized] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const origPreviewRef = useRef<HTMLDivElement | null>(null);
  const sanPreviewRef = useRef<HTMLPreElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const isSyncingScrollRef = useRef<boolean>(false);
  const analyzeTimerRef = useRef<number | null>(null);
  const activeObjectUrlsRef = useRef<Set<string>>(new Set());
  const noticeIdRef = useRef<number>(1);

  const pushNotice = useCallback(
    (tone: StatusNotice['tone'], title: string, detail?: string) => {
      noticeIdRef.current += 1;
      setNotice({ id: noticeIdRef.current, tone, title, detail });
    },
    []
  );

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    window.addEventListener('mousedown', onOutsideClick);
    return () => window.removeEventListener('mousedown', onOutsideClick);
  }, [settingsOpen]);

  const revokeAllObjectUrls = useCallback(() => {
    for (const url of activeObjectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    activeObjectUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      revokeAllObjectUrls();
      if (analyzeTimerRef.current !== null) {
        window.clearTimeout(analyzeTimerRef.current);
      }
    };
  }, [revokeAllObjectUrls]);

  const deferredText = useDeferredValue(sourceText);
  const isDetecting = deferredText !== sourceText && sourceText.length > 0;

  const detection = useMemo(
    () => detectPiiEntities(deferredText, { includeFailedLuhnCards }),
    [deferredText, includeFailedLuhnCards]
  );

  const maskValidation = useMemo(() => validateCustomMask(customMaskInput), [customMaskInput]);
  const effectiveCustomMask =
    redactionMode === 'custom' ? maskValidation.sanitizedMask : DEFAULT_CUSTOM_MASK;

  const redaction = useMemo(
    () => applyRedaction(deferredText, detection.findings, redactionMode, effectiveCustomMask),
    [deferredText, detection.findings, redactionMode, effectiveCustomMask]
  );

  const handleAnalyze = useCallback(() => {
    if (!sourceText.trim()) {
      pushNotice('error', 'No text to analyze.', 'Paste content or upload a .txt or .csv file first.');
      return;
    }

    if (analyzeTimerRef.current !== null) {
      window.clearTimeout(analyzeTimerRef.current);
    }

    setIsAnalyzing(true);
    const delayMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 90;

    analyzeTimerRef.current = window.setTimeout(() => {
      const immediate = detectPiiEntities(sourceText, { includeFailedLuhnCards });
      setIsAnalyzing(false);
      setHasAnalyzed(true);

      if (immediate.summary.total > 0) {
        pushNotice(
          'success',
          `Analyzed locally: ${immediate.summary.total} ${immediate.summary.total === 1 ? 'entity' : 'entities'} detected and redacted.`,
          `${immediate.summary.rejectedCount} invalid/unverified candidate(s) filtered.`
        );
      } else {
        pushNotice(
          'info',
          'Analysis complete: no matching PII detected.',
          `${immediate.summary.rejectedCount} invalid candidate(s) filtered.`
        );
      }

      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }, delayMs);
  }, [includeFailedLuhnCards, pushNotice, sourceText]);

  const handlePreviewScroll = (source: 'orig' | 'san') => {
    if (!syncScroll || isSyncingScrollRef.current) return;
    const fromEl = source === 'orig' ? origPreviewRef.current : sanPreviewRef.current;
    const toEl = source === 'orig' ? sanPreviewRef.current : origPreviewRef.current;
    if (!fromEl || !toEl) return;

    const fromMax = fromEl.scrollHeight - fromEl.clientHeight;
    const toMax = toEl.scrollHeight - toEl.clientHeight;
    if (fromMax <= 0 || toMax <= 0) return;

    isSyncingScrollRef.current = true;
    const ratio = fromEl.scrollTop / fromMax;
    toEl.scrollTop = ratio * toMax;
    requestAnimationFrame(() => {
      isSyncingScrollRef.current = false;
    });
  };

  const applyDocument = useCallback(
    (text: string, fileName: string | null, fileType: DocumentMeta['fileType']) => {
      const byteSize = new TextEncoder().encode(text).length;
      const csvState = fileType === 'csv' ? parseCsvDocument(text) : null;

      setSourceText(text);
      setSelectedFindingId(null);
      setLastFormulaNeutralized(0);
      setDocMeta({
        fileName,
        fileType,
        byteSize,
        csvState,
      });

      if (csvState && !csvState.valid) {
        pushNotice(
          'warning',
          'CSV structure needs attention.',
          `${csvState.issues[0]} Edit the text or re-import a valid CSV file.`
        );
      } else if (fileName) {
        pushNotice(
          'success',
          `Loaded ${fileName} locally.`,
          'Click "Analyze & Redact" to inspect and sanitize.'
        );
      }
    },
    [pushNotice]
  );

  const handleTextChange = (nextText: string) => {
    const fileType = docMeta.fileType === 'csv' ? 'csv' : 'text';
    const csvState = fileType === 'csv' && nextText.trim().length > 0 ? parseCsvDocument(nextText) : null;
    setSourceText(nextText);
    setSelectedFindingId(null);
    setLastFormulaNeutralized(0);
    setDocMeta((prev) => ({
      ...prev,
      byteSize: new TextEncoder().encode(nextText).length,
      csvState,
    }));
  };

  const handleFile = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      const isTxt = lower.endsWith('.txt') || file.type === 'text/plain';
      const isCsv = lower.endsWith('.csv') || file.type === 'text/csv';

      if (!isTxt && !isCsv) {
        pushNotice(
          'error',
          'That file isn’t plain text or CSV.',
          `Rejected "${file.name}". Upload a .txt or .csv file, or paste text directly.`
        );
        return;
      }

      try {
        const content = await file.text();
        if (content.includes('\0')) {
          pushNotice(
            'error',
            'Binary content detected.',
            `"${file.name}" contains null bytes and cannot be inspected as plain text or CSV.`
          );
          return;
        }
        applyDocument(content, file.name, isCsv ? 'csv' : 'txt');
      } catch {
        pushNotice(
          'error',
          'Could not read the selected file.',
          'Check file permissions and try importing again.'
        );
      }
    },
    [applyDocument, pushNotice]
  );

  const handleSecureReset = useCallback(() => {
    revokeAllObjectUrls();
    if (analyzeTimerRef.current !== null) {
      window.clearTimeout(analyzeTimerRef.current);
    }
    setSourceText('');
    setDocMeta(EMPTY_META);
    setHasAnalyzed(false);
    setIsAnalyzing(false);
    setSelectedFindingId(null);
    setLastFormulaNeutralized(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    pushNotice(
      'info',
      'Workspace cleared.',
      'In-memory text, findings, pseudonym map, file state, and temporary export URLs have been cleared.'
    );
  }, [pushNotice, revokeAllObjectUrls]);

  const handleLoadSampleText = useCallback(() => {
    applyDocument(SAMPLE_CASE_TEXT, 'sample-intake-case.txt', 'txt');
  }, [applyDocument]);

  const handleLoadSampleCsv = useCallback(() => {
    applyDocument(SAMPLE_CSV_TEXT, 'sample-intake-batch.csv', 'csv');
  }, [applyDocument]);

  const triggerDownload = useCallback(
    (content: string, filename: string, mimeType: string) => {
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      activeObjectUrlsRef.current.add(url);

      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.style.display = 'none';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        activeObjectUrlsRef.current.delete(url);
      }, 1000);
    },
    []
  );

  const handleCopySanitized = useCallback(async () => {
    if (!sourceText || isDetecting) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(redaction.sanitizedText);
      } else {
        throw new Error('Clipboard API unavailable');
      }
      pushNotice(
        'success',
        'Sanitized text copied to clipboard.',
        `${redaction.spans.length} ${redaction.spans.length === 1 ? 'entity' : 'entities'} redacted locally.`
      );
    } catch {
      try {
        const tempArea = document.createElement('textarea');
        tempArea.value = redaction.sanitizedText;
        tempArea.setAttribute('readonly', '');
        tempArea.style.position = 'fixed';
        tempArea.style.opacity = '0';
        document.body.appendChild(tempArea);
        tempArea.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(tempArea);
        if (!copied) throw new Error('execCommand copy returned false');
        pushNotice(
          'success',
          'Sanitized text copied to clipboard.',
          `${redaction.spans.length} ${redaction.spans.length === 1 ? 'entity' : 'entities'} redacted locally.`
        );
      } catch {
        pushNotice(
          'error',
          'Clipboard access was blocked.',
          'Copy directly from the Sanitized Preview pane or use TXT/CSV export.'
        );
      }
    }
  }, [isDetecting, pushNotice, redaction.sanitizedText, redaction.spans.length, sourceText]);

  const handleExportTxt = useCallback(() => {
    if (!sourceText || isDetecting) return;
    const filename = buildSafeExportFilename(docMeta.fileName, 'sanitized', 'txt');
    triggerDownload(redaction.sanitizedText, filename, 'text/plain;charset=utf-8');
    pushNotice(
      'success',
      `Exported ${filename}.`,
      `Sanitized output only (${redaction.spans.length} redacted spans). Temporary URL revoked.`
    );
  }, [docMeta.fileName, isDetecting, pushNotice, redaction.sanitizedText, redaction.spans.length, sourceText, triggerDownload]);

  const handleExportCsv = useCallback(() => {
    if (!sourceText || isDetecting) return;
    if (docMeta.csvState && !docMeta.csvState.valid) {
      pushNotice(
        'error',
        'Cannot export malformed CSV.',
        'Fix the CSV syntax issues shown above before downloading a structured CSV file.'
      );
      return;
    }

    const prep = prepareSafeCsvExport(
      redaction.sanitizedText,
      docMeta.csvState?.delimiter,
      docMeta.csvState?.lineEnding
    );
    setLastFormulaNeutralized(prep.neutralizedCount);

    const filename = buildSafeExportFilename(docMeta.fileName, 'sanitized', 'csv');
    triggerDownload(prep.csvContent, filename, 'text/csv;charset=utf-8');

    const formulaNote =
      prep.neutralizedCount > 0
        ? ` Neutralized ${prep.neutralizedCount} formula-leading cell(s) with a leading apostrophe (').`
        : ' No formula-leading cells found.';
    pushNotice(
      'success',
      `Exported ${filename} (${prep.rowCount}×${prep.columnCount}).`,
      `CSV structure preserved.${formulaNote} Temporary URL revoked.`
    );
  }, [docMeta.csvState, docMeta.fileName, isDetecting, pushNotice, redaction.sanitizedText, sourceText, triggerDownload]);

  const handleExportSummaryReport = useCallback(() => {
    if (!sourceText || isDetecting) return;
    const report = buildSummaryReportText({
      docMeta,
      summary: detection.summary,
      spans: redaction.spans,
      mode: redactionMode,
      customMask: effectiveCustomMask,
      formulaNeutralizedCount: lastFormulaNeutralized,
    });
    const filename = buildSafeExportFilename(docMeta.fileName, 'summary-report', 'txt');
    triggerDownload(report, filename, 'text/plain;charset=utf-8');
    pushNotice(
      'success',
      `Exported ${filename}.`,
      'Report includes counts, validation caveats, and safe audit labels only.'
    );
  }, [
    detection.summary,
    docMeta,
    effectiveCustomMask,
    isDetecting,
    lastFormulaNeutralized,
    pushNotice,
    redaction.spans,
    redactionMode,
    sourceText,
    triggerDownload,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.isComposing) {
        if (sourceText.trim().length > 0) {
          e.preventDefault();
          handleAnalyze();
        }
        return;
      }
      if (!e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
      const key = e.key.toLowerCase();
      if (key === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (key === 'c') {
        e.preventDefault();
        void handleCopySanitized();
      } else if (key === 'x') {
        e.preventDefault();
        handleSecureReset();
      } else if (key === 'd') {
        e.preventDefault();
        setForensicOpen((prev) => !prev);
      } else if (key === 't') {
        e.preventDefault();
        setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleAnalyze, handleCopySanitized, handleSecureReset, sourceText]);

  const hasText = sourceText.length > 0;
  const showResults = hasAnalyzed && hasText;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand-lockup">
            <BrandDocMark />
            <span className="brand-name">PrivacyDesk</span>
          </div>

          <div className="header-controls" ref={settingsRef}>
            <span className="local-badge" role="status" aria-live="polite">
              <span className="local-dot" aria-hidden="true" />
              LOCAL PROCESSING
            </span>

            <button
              type="button"
              className="btn"
              onClick={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
              aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
            >
              {theme === 'light' ? <IconMoon /> : <IconSun />}
              <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
            </button>

            <button
              type="button"
              className="btn btn-icon"
              onClick={() => setSettingsOpen((prev) => !prev)}
              aria-label="Open settings"
              aria-expanded={settingsOpen}
            >
              <IconSettings />
            </button>

            {settingsOpen && (
              <div className="settings-popover" role="dialog" aria-label="Workspace settings">
                <h2 className="settings-title">Settings</h2>

                <label className="setting-row">
                  <input
                    type="checkbox"
                    checked={includeFailedLuhnCards}
                    onChange={(e) => setIncludeFailedLuhnCards(e.target.checked)}
                  />
                  <span>
                    <strong>Redact failed-Luhn card candidates</strong>
                    <span className="setting-hint">
                      Off by default. Labels matches as unverified possible candidates.
                    </span>
                  </span>
                </label>

                <label className="setting-row">
                  <input
                    type="checkbox"
                    checked={syncScroll}
                    onChange={(e) => setSyncScroll(e.target.checked)}
                  />
                  <span>
                    <strong>Synchronize preview scrolling</strong>
                    <span className="setting-hint">
                      Keep Original Evidence and Sanitized Preview aligned.
                    </span>
                  </span>
                </label>

                <div className="shortcut-grid">
                  <div className="shortcut-row">
                    <span>Analyze &amp; Redact</span>
                    <span className="mono">Ctrl/Cmd+Enter</span>
                  </div>
                  <div className="shortcut-row">
                    <span>Browse File</span>
                    <span className="mono">Alt+O</span>
                  </div>
                  <div className="shortcut-row">
                    <span>Copy Sanitized</span>
                    <span className="mono">Alt+C</span>
                  </div>
                  <div className="shortcut-row">
                    <span>Clear / Reset</span>
                    <span className="mono">Alt+X</span>
                  </div>
                  <div className="shortcut-row">
                    <span>Forensic Panel</span>
                    <span className="mono">Alt+D</span>
                  </div>
                  <div className="shortcut-row">
                    <span>Toggle Theme</span>
                    <span className="mono">Alt+T</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="workspace-container">
        <section className="welcome-header">
          <h1 className="welcome-title">Secure your text.</h1>
          <p className="welcome-subtitle">
            Detect, analyze and redact sensitive information.
          </p>
        </section>

        {notice && (
          <div className={`notice-banner tone-${notice.tone}`} role="status" aria-live="polite">
            <div>
              <span className="notice-title">{notice.title}</span>
              {notice.detail && <span className="notice-detail">{notice.detail}</span>}
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => setNotice(null)}
              aria-label="Dismiss notification"
            >
              Dismiss
            </button>
          </div>
        )}

        {docMeta.csvState && !docMeta.csvState.valid && (
          <div className="notice-banner tone-warning" role="alert">
            <div>
              <span className="notice-title">
                <IconAlert style={{ verticalAlign: 'text-bottom', marginRight: '6px' }} />
                Malformed CSV detected
              </span>
              <span className="notice-detail">
                {docMeta.csvState.issues.join(' ')} Correct the text below or re-import a clean CSV.
              </span>
            </div>
          </div>
        )}

        <section
          className={`input-card ${isDragging ? 'is-dragging' : ''}`}
          aria-label="Evidence input"
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const droppedFile = e.dataTransfer.files[0];
            if (droppedFile) void handleFile(droppedFile);
          }}
        >
          <div className="input-topbar">
            <div className="input-actions">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                className="sr-only"
                aria-label="Upload TXT or CSV file"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) void handleFile(chosen);
                }}
              />
              <button
                type="button"
                className="btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <IconUpload />
                <span>Browse File</span>
              </button>
              <button type="button" className="btn" onClick={handleLoadSampleText}>
                <IconFileText />
                <span>Sample TXT</span>
              </button>
              <button type="button" className="btn" onClick={handleLoadSampleCsv}>
                <IconFileText />
                <span>Sample CSV</span>
              </button>
            </div>

            <div className="input-actions">
              <span className="file-chip">
                {docMeta.fileName ?? 'Direct text input'} · {formatBytes(docMeta.byteSize)}
                {docMeta.csvState
                  ? ` · ${docMeta.csvState.rowCount}×${docMeta.csvState.columnCount} CSV`
                  : ''}
              </span>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleSecureReset}
                disabled={!hasText && !docMeta.fileName}
              >
                <IconTrash />
                <span>Clear / Reset</span>
              </button>
            </div>
          </div>

          <div className="drop-hint">
            <span>Drag and drop a .txt or .csv file here, or paste text directly below.</span>
            <span className="mono" style={{ fontSize: '0.75rem' }}>
              Nothing leaves this browser tab
            </span>
          </div>

          <label htmlFor="evidence-input" className="sr-only">
            Evidence text input
          </label>
          <textarea
            id="evidence-input"
            className="editor-textarea"
            value={sourceText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Paste emails, phone numbers, IPv4/IPv6 addresses, PAN, Aadhaar, payment card numbers, or CSV rows..."
            spellCheck={false}
          />

          <div className="editor-footer">
            <span className="mono tabular">
              {sourceText.length.toLocaleString()} characters ·{' '}
              {hasText ? sourceText.split(/\r\n|\n/).length : 0} lines
            </span>
            <span>Shortcut: Ctrl/Cmd+Enter to analyze</span>
          </div>

          <button
            type="button"
            className="btn btn-analyze"
            disabled={!sourceText.trim() || isAnalyzing}
            onClick={handleAnalyze}
          >
            {isAnalyzing ? (
              <>
                <span className="spinner" aria-hidden="true" />
                <span>Analyzing locally...</span>
              </>
            ) : (
              <>
                <IconSearch />
                <span>Analyze &amp; Redact</span>
              </>
            )}
          </button>
        </section>

        {!showResults ? (
          <div className="empty-prompt">
            {hasText
              ? 'Input ready. Click "Analyze & Redact" above to inspect detected entities and preview redacted output.'
              : 'Your Original Evidence and Sanitized Preview panes will appear here after analysis.'}
          </div>
        ) : (
          <section
            id="results-workspace"
            ref={resultsRef}
            className="results-section"
            aria-label="Analysis and redaction results"
          >
            <div className="results-summary-bar">
              <div className="summary-stats">
                <div className="summary-metric">
                  <span className="metric-num tabular">{detection.summary.total}</span>
                  <span className="metric-label">Total detected</span>
                </div>
                <div className="summary-metric">
                  <span className="metric-num tabular" style={{ color: 'var(--status-ok)' }}>
                    {redaction.spans.length}
                  </span>
                  <span className="metric-label">Successfully redacted</span>
                </div>
                <div className="summary-metric">
                  <span className="metric-num tabular" style={{ color: 'var(--status-warn)' }}>
                    {detection.summary.rejectedCount}
                  </span>
                  <span className="metric-label">Invalid / unverified</span>
                </div>
              </div>

              <div className="input-actions">
                <button
                  type="button"
                  className="btn"
                  onClick={() => void handleCopySanitized()}
                  disabled={!hasText || isDetecting}
                >
                  <IconCopy />
                  <span>Copy Sanitized</span>
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleExportTxt}
                  disabled={!hasText || isDetecting}
                >
                  <IconDownload />
                  <span>Export TXT</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExportCsv}
                  disabled={!hasText || isDetecting || (docMeta.csvState !== null && !docMeta.csvState.valid)}
                >
                  <IconDownload />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            <div className="mode-toolbar">
              <div className="segmented-control" role="radiogroup" aria-label="Redaction mode">
                {(
                  [
                    ['full', 'Full Mask'],
                    ['partial', 'Partial Mask'],
                    ['pseudonym', 'Consistent Pseudonym'],
                    ['custom', 'Custom Placeholder'],
                  ] as const
                ).map(([modeValue, modeLabel]) => (
                  <button
                    key={modeValue}
                    type="button"
                    role="radio"
                    aria-checked={redactionMode === modeValue}
                    className={`seg-btn ${redactionMode === modeValue ? 'is-active' : ''}`}
                    onClick={() => setRedactionMode(modeValue)}
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
                    onChange={(e) => setCustomMaskInput(e.target.value)}
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
                  onChange={(e) => setIncludeFailedLuhnCards(e.target.checked)}
                />
                <span>Redact failed-Luhn card candidates</span>
              </label>
            </div>

            <div className="comparison-grid">
              <section className="pane-card" aria-label="Original Evidence">
                <div className="pane-head">
                  <h2 className="pane-title">Original Evidence</h2>
                  <span className="pane-meta tabular">{detection.summary.total} highlighted</span>
                </div>
                <div className="legend-strip" aria-label="Detected entity categories">
                  {CATEGORY_ORDER.filter((cat) => detection.summary.byCategory[cat] > 0).map(
                    (cat) => {
                      const meta = CATEGORY_META[cat];
                      return (
                        <span key={cat} className="legend-pill tabular">
                          <span
                            className="legend-dot"
                            style={{ backgroundColor: meta.colorVar }}
                            aria-hidden="true"
                          />
                          {meta.shortTag}: {detection.summary.byCategory[cat]}
                        </span>
                      );
                    }
                  )}
                  {detection.summary.total === 0 && (
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
                    findings={detection.findings}
                    selectedFindingId={selectedFindingId}
                    onSelectFinding={setSelectedFindingId}
                  />
                </div>
              </section>

              <section className="pane-card" aria-label="Sanitized Preview">
                <div className="pane-head">
                  <h2 className="pane-title">Sanitized Preview</h2>
                  <span className="pane-meta tabular">
                    {redaction.spans.length} redacted · {redactionMode}
                  </span>
                </div>
                <pre
                  ref={sanPreviewRef}
                  className="pane-scroll"
                  onScroll={() => handlePreviewScroll('san')}
                >
                  <SanitizedText
                    text={redaction.sanitizedText}
                    spans={redaction.spans}
                    selectedFindingId={selectedFindingId}
                    onSelectFinding={setSelectedFindingId}
                  />
                </pre>
              </section>
            </div>

            <section className="forensic-panel" aria-label="Audit and forensic details">
              <button
                type="button"
                className="forensic-toggle"
                onClick={() => setForensicOpen((prev) => !prev)}
                aria-expanded={forensicOpen}
                aria-controls="forensic-drawer-body"
              >
                <span>
                  Forensic &amp; Audit Details ({redaction.spans.length} entities ·{' '}
                  {detection.summary.rejectedCount} filtered)
                </span>
                <IconChevronDown
                  style={{
                    transform: forensicOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform var(--transition-fast)',
                  }}
                />
              </button>

              {forensicOpen && (
                <div id="forensic-drawer-body" className="forensic-body">
                  <div className="mode-toolbar">
                    <div className="segmented-control" role="tablist" aria-label="Forensic tabs">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={forensicTab === 'audit'}
                        className={`seg-btn ${forensicTab === 'audit' ? 'is-active' : ''}`}
                        onClick={() => setForensicTab('audit')}
                      >
                        Audit ({redaction.spans.length})
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={forensicTab === 'summary'}
                        className={`seg-btn ${forensicTab === 'summary' ? 'is-active' : ''}`}
                        onClick={() => setForensicTab('summary')}
                      >
                        Summary
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={forensicTab === 'history'}
                        className={`seg-btn ${forensicTab === 'history' ? 'is-active' : ''}`}
                        onClick={() => setForensicTab('history')}
                      >
                        History
                      </button>
                    </div>

                    {forensicTab === 'summary' && (
                      <button
                        type="button"
                        className="btn"
                        onClick={handleExportSummaryReport}
                        disabled={!hasText || isDetecting}
                      >
                        <IconDownload />
                        <span>Export Summary Report</span>
                      </button>
                    )}
                  </div>

                  {forensicTab === 'audit' && (
                    <>
                      {redaction.spans.length === 0 ? (
                        <p className="audit-note">No entities redacted in the current text.</p>
                      ) : (
                        <div className="audit-grid">
                          {redaction.spans.map((span) => {
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

                      {detection.summary.rejectedNotes.length > 0 && (
                        <>
                          <strong style={{ fontSize: '0.8125rem' }}>
                            Filtered / Unverified Candidates ({detection.summary.rejectedCount})
                          </strong>
                          <div className="audit-grid">
                            {detection.summary.rejectedNotes.map((rej, idx) => (
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

                  {forensicTab === 'summary' && (
                    <>
                      <div className="audit-grid">
                        <div className="audit-card">
                          <span className="metric-label">Processing Time</span>
                          <strong className="mono tabular">
                            {detection.summary.processingMs} ms (Local browser tab)
                          </strong>
                        </div>
                        <div className="audit-card">
                          <span className="metric-label">Active Redaction Mode</span>
                          <strong className="mono">{redactionMode.toUpperCase()}</strong>
                        </div>
                        <div className="audit-card">
                          <span className="metric-label">Unique Pseudonyms</span>
                          <strong className="mono tabular">
                            {redaction.uniquePseudonymCount} (Session RAM only)
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
                        <code>=</code>, <code>+</code>, <code>-</code>, <code>@</code>, tab, or CR
                        are neutralized with a leading apostrophe (<code>'</code>) while keeping
                        ordinary safe cells untouched.
                      </div>
                    </>
                  )}

                  {forensicTab === 'history' && (
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
          </section>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <span>PrivacyDesk — 100% browser-local detection &amp; redaction · Nothing leaves this tab</span>
          <span>Shortcuts: Ctrl/Cmd+Enter Analyze · Alt+O File · Alt+C Copy · Alt+X Reset · Alt+D Audit · Alt+T Theme</span>
        </div>
      </footer>
    </div>
  );
}
