import { useState, type RefObject } from 'react';
import type { DocumentMeta } from '../core/types';
import { IconFileText, IconSearch, IconTrash, IconUpload } from './Icons';

interface InputCardProps {
  sourceText: string;
  docMeta: DocumentMeta;
  isAnalyzing: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onTextChange: (text: string) => void;
  onFileSelected: (file: File) => void;
  onLoadSampleText: () => void;
  onLoadSampleCsv: () => void;
  onReset: () => void;
  onAnalyze: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function InputCard({
  sourceText,
  docMeta,
  isAnalyzing,
  fileInputRef,
  onTextChange,
  onFileSelected,
  onLoadSampleText,
  onLoadSampleCsv,
  onReset,
  onAnalyze,
}: InputCardProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const hasText = sourceText.length > 0;

  return (
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
        if (droppedFile) onFileSelected(droppedFile);
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
              if (chosen) onFileSelected(chosen);
            }}
          />
          <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
            <IconUpload />
            <span>Browse File</span>
          </button>
          <button type="button" className="btn" onClick={onLoadSampleText}>
            <IconFileText />
            <span>Sample TXT</span>
          </button>
          <button type="button" className="btn" onClick={onLoadSampleCsv}>
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
            onClick={onReset}
            disabled={!hasText && !docMeta.fileName}
          >
            <IconTrash />
            <span>Clear / Reset</span>
          </button>
        </div>
      </div>

      <div className="drop-hint">
        <span>Drag and drop a .txt or .csv file (up to 10 MB), or paste text directly below.</span>
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
        onChange={(e) => onTextChange(e.target.value)}
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
        onClick={onAnalyze}
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
  );
}

