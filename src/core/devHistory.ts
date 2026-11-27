export interface StageLogEntry {
  stage: string;
  title: string;
  status: 'completed' | 'in_progress';
  notes: string;
}

export interface FeatureChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/**
 * Local, static product metadata for prompt-wise development tracking.
 * Never holds user documents, findings, or runtime PII.
 */
export const DEVELOPMENT_HISTORY: readonly StageLogEntry[] = [
  {
    stage: 'Stage 1',
    title: 'Workspace Inspection & Visual Architecture',
    status: 'completed',
    notes: 'Defined forensic redaction desk aesthetic, light/dark tokens, typography, and 4/8px grid.',
  },
  {
    stage: 'Stage 2',
    title: 'Responsive Shell, Theme & Intake Workflow',
    status: 'completed',
    notes: 'Built intake rail, .txt/.csv drag-drop, strict CSV parser, sample loader, and light/dark themes.',
  },
  {
    stage: 'Stage 3',
    title: 'PII Detection & Checksum Validators',
    status: 'completed',
    notes: 'Implemented Email, Indian Phone, IPv4 (0–255), PAN, Aadhaar (Verhoeff), and Payment Card (Luhn + BIN).',
  },
  {
    stage: 'Stage 4',
    title: 'Redaction Modes & Synchronized Diff Panes',
    status: 'completed',
    notes: 'Added Full Mask, Partial Mask, Consistent Pseudonymization, mask validation, and scroll sync.',
  },
  {
    stage: 'Stage 5',
    title: 'Audit Drawer, Safe Exports & Reset',
    status: 'completed',
    notes: 'Added PII-free audit log, summary report, formula-safe CSV export, URL revocation, and reset.',
  },
  {
    stage: 'Stage 6',
    title: 'Browser Verification across Viewports',
    status: 'completed',
    notes: 'Verified unit suite and live Chromium checks at 375px, 768px, and 1280px.',
  },
];

export const IMPLEMENTED_FEATURES: readonly FeatureChecklistItem[] = [
  { id: 'input', label: 'Pasted text, .txt/.csv upload & drag-drop with type rejection', done: true },
  { id: 'csv-parse', label: 'CSV delimiter/quote preservation & malformed syntax alerts', done: true },
  { id: 'detectors', label: '6 PII detectors with Verhoeff, Luhn, and IPv4 0–255 checks', done: true },
  { id: 'overlap', label: 'Non-overlapping deterministic range resolution', done: true },
  { id: 'modes', label: 'Full, category-aware Partial, and Consistent Pseudonymization', done: true },
  { id: 'compare', label: 'Side-by-side / mobile-tabbed highlighted panes & scroll sync', done: true },
  { id: 'audit', label: 'PII-free audit log, caveats summary, and local prompt history', done: true },
  { id: 'export', label: 'Copy, sanitized TXT/CSV (formula-safe), report export & URL cleanup', done: true },
  { id: 'privacy', label: '100% in-tab processing, zero storage, zero network calls', done: true },
];

