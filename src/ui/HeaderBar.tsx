import { useEffect, useRef, type RefObject } from 'react';
import { BrandDocMark, IconMoon, IconSettings, IconSun } from './Icons';

export type ThemeMode = 'light' | 'dark';

interface HeaderBarProps {
  theme: ThemeMode;
  onToggleTheme: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  onCloseSettings: () => void;
  includeFailedLuhnCards: boolean;
  onChangeIncludeFailedLuhn: (checked: boolean) => void;
  syncScroll: boolean;
  onChangeSyncScroll: (checked: boolean) => void;
}

export function HeaderBar({
  theme,
  onToggleTheme,
  settingsOpen,
  onToggleSettings,
  onCloseSettings,
  includeFailedLuhnCards,
  onChangeIncludeFailedLuhn,
  syncScroll,
  onChangeSyncScroll,
}: HeaderBarProps) {
  const controlsRef: RefObject<HTMLDivElement | null> = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;
    const onOutsideClick = (e: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) {
        onCloseSettings();
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseSettings();
    };
    window.addEventListener('mousedown', onOutsideClick);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('mousedown', onOutsideClick);
      window.removeEventListener('keydown', onEscape);
    };
  }, [onCloseSettings, settingsOpen]);

  return (
    <header className="app-header">
      <div className="header-inner">
        <div className="brand-lockup">
          <BrandDocMark />
          <span className="brand-name">PrivacyDesk</span>
        </div>

        <div className="header-controls" ref={controlsRef}>
          <span className="local-badge" role="status" aria-live="polite">
            <span className="local-dot" aria-hidden="true" />
            LOCAL PROCESSING
          </span>

          <button
            type="button"
            className="btn"
            onClick={onToggleTheme}
            aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          >
            {theme === 'light' ? <IconMoon /> : <IconSun />}
            <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>

          <button
            type="button"
            className="btn btn-icon"
            onClick={onToggleSettings}
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
                  onChange={(e) => onChangeIncludeFailedLuhn(e.target.checked)}
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
                  onChange={(e) => onChangeSyncScroll(e.target.checked)}
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
  );
}

