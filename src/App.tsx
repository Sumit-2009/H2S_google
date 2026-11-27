import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { copyTextToClipboard } from './core/clipboard';
import { parseCsvDocument } from './core/csv';
import { detectPiiEntities } from './core/detector';
import {
  buildSafeExportFilename,
  buildSummaryReportText,
  prepareSafeCsvExport,
} from './core/exporter';
import { applyRedaction, DEFAULT_CUSTOM_MASK, validateCustomMask } from './core/redactor';
import { SAMPLE_CASE_TEXT, SAMPLE_CSV_TEXT } from './core/sampleData';
import type { DocumentMeta, RedactionMode, StatusNotice } from './core/types';
import { ForensicPanel, type ForensicTab } from './ui/ForensicPanel';
import { HeaderBar, type ThemeMode } from './ui/HeaderBar';
import { IconAlert } from './ui/Icons';
import { InputCard } from './ui/InputCard';
import { ResultsWorkspace } from './ui/ResultsWorkspace';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const EMPTY_META: DocumentMeta = {
  fileName: null,
  fileType: 'text',
  byteSize: 0,
  csvState: null,
};

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
  const [selectedFindingId, setSelectedFindingId] = useState<string | null>(null);
  const [lastFormulaNeutralized, setLastFormulaNeutralized] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
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

  const cancelPendingAnalysis = useCallback(() => {
    if (analyzeTimerRef.current !== null) {
      window.clearTimeout(analyzeTimerRef.current);
      analyzeTimerRef.current = null;
    }
    setIsAnalyzing(false);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

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

  const updateDocumentState = useCallback(
    (
      text: string,
      fileName: string | null,
      fileType: DocumentMeta['fileType'],
      announceLoaded: boolean
    ) => {
      cancelPendingAnalysis();
      const byteSize = new TextEncoder().encode(text).length;
      const shouldParseCsv = fileType === 'csv' && (announceLoaded || text.trim().length > 0);
      const csvState = shouldParseCsv ? parseCsvDocument(text) : null;

      setSourceText(text);
      setSelectedFindingId(null);
      setLastFormulaNeutralized(0);
      setDocMeta({ fileName, fileType, byteSize, csvState });

      if (announceLoaded) {
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
      }
    },
    [cancelPendingAnalysis, pushNotice]
  );

  const handleTextChange = useCallback(
    (nextText: string) => {
      const nextType = docMeta.fileType === 'csv' ? 'csv' : 'text';
      updateDocumentState(nextText, docMeta.fileName, nextType, false);
    },
    [docMeta.fileName, docMeta.fileType, updateDocumentState]
  );

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

      if (file.size > MAX_FILE_BYTES) {
        pushNotice(
          'error',
          'File exceeds the 10 MB browser limit.',
          `"${file.name}" is too large to process safely in memory. Split the file and try again.`
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
        updateDocumentState(content, file.name, isCsv ? 'csv' : 'txt', true);
      } catch {
        pushNotice(
          'error',
          'Could not read the selected file.',
          'Check file permissions and try importing again.'
        );
      }
    },
    [pushNotice, updateDocumentState]
  );

  const handleAnalyze = useCallback(() => {
    if (!sourceText.trim()) {
      pushNotice('error', 'No text to analyze.', 'Paste content or upload a .txt or .csv file first.');
      return;
    }

    cancelPendingAnalysis();
    setIsAnalyzing(true);
    const delayMs = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 90;

    analyzeTimerRef.current = window.setTimeout(() => {
      analyzeTimerRef.current = null;
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
  }, [cancelPendingAnalysis, includeFailedLuhnCards, pushNotice, sourceText]);

  const handleSecureReset = useCallback(() => {
    cancelPendingAnalysis();
    revokeAllObjectUrls();
    setSourceText('');
    setDocMeta(EMPTY_META);
    setHasAnalyzed(false);
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
  }, [cancelPendingAnalysis, pushNotice, revokeAllObjectUrls]);

  const triggerDownload = useCallback((content: string, filename: string, mimeType: string) => {
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
  }, []);

  const handleCopySanitized = useCallback(async () => {
    if (!sourceText || isDetecting) return;
    const copied = await copyTextToClipboard(redaction.sanitizedText);
    if (copied) {
      pushNotice(
        'success',
        'Sanitized text copied to clipboard.',
        `${redaction.spans.length} ${redaction.spans.length === 1 ? 'entity' : 'entities'} redacted locally.`
      );
    } else {
      pushNotice(
        'error',
        'Clipboard access was blocked.',
        'Copy directly from the Sanitized Preview pane or use TXT/CSV export.'
      );
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
    const structureNote = prep.validStructure
      ? 'CSV structure preserved.'
      : 'Exported with ragged row lengths from direct text input.';
    pushNotice(
      'success',
      `Exported ${filename} (${prep.rowCount}×${prep.columnCount}).`,
      `${structureNote}${formulaNote} Temporary URL revoked.`
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
      <HeaderBar
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))}
        settingsOpen={settingsOpen}
        onToggleSettings={() => setSettingsOpen((prev) => !prev)}
        onCloseSettings={() => setSettingsOpen(false)}
        includeFailedLuhnCards={includeFailedLuhnCards}
        onChangeIncludeFailedLuhn={setIncludeFailedLuhnCards}
        syncScroll={syncScroll}
        onChangeSyncScroll={setSyncScroll}
      />

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

        <InputCard
          sourceText={sourceText}
          docMeta={docMeta}
          isAnalyzing={isAnalyzing}
          fileInputRef={fileInputRef}
          onTextChange={handleTextChange}
          onFileSelected={(file) => void handleFile(file)}
          onLoadSampleText={() =>
            updateDocumentState(SAMPLE_CASE_TEXT, 'sample-intake-case.txt', 'txt', true)
          }
          onLoadSampleCsv={() =>
            updateDocumentState(SAMPLE_CSV_TEXT, 'sample-intake-batch.csv', 'csv', true)
          }
          onReset={handleSecureReset}
          onAnalyze={handleAnalyze}
        />

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
            <ResultsWorkspace
              deferredText={deferredText}
              findings={detection.findings}
              summary={detection.summary}
              sanitizedText={redaction.sanitizedText}
              spans={redaction.spans}
              docMeta={docMeta}
              isDetecting={isDetecting}
              syncScroll={syncScroll}
              redactionMode={redactionMode}
              customMaskInput={customMaskInput}
              maskValidation={maskValidation}
              includeFailedLuhnCards={includeFailedLuhnCards}
              selectedFindingId={selectedFindingId}
              onSelectFinding={setSelectedFindingId}
              onChangeMode={setRedactionMode}
              onChangeCustomMask={setCustomMaskInput}
              onChangeIncludeFailedLuhn={setIncludeFailedLuhnCards}
              onCopySanitized={() => void handleCopySanitized()}
              onExportTxt={handleExportTxt}
              onExportCsv={handleExportCsv}
            />

            <ForensicPanel
              open={forensicOpen}
              onToggleOpen={() => setForensicOpen((prev) => !prev)}
              activeTab={forensicTab}
              onChangeTab={setForensicTab}
              spans={redaction.spans}
              summary={detection.summary}
              redactionMode={redactionMode}
              uniquePseudonymCount={redaction.uniquePseudonymCount}
              selectedFindingId={selectedFindingId}
              canExportReport={hasText && !isDetecting}
              onExportSummaryReport={handleExportSummaryReport}
            />
          </section>
        )}
      </main>

      <footer className="app-footer">
        <div className="footer-inner">
          <span>
            PrivacyDesk — 100% browser-local detection &amp; redaction · Nothing leaves this tab
          </span>
          <span>
            Shortcuts: Ctrl/Cmd+Enter Analyze · Alt+O File · Alt+C Copy · Alt+X Reset · Alt+D Audit · Alt+T Theme
          </span>
        </div>
      </footer>
    </div>
  );
}
