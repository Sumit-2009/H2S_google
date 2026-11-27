/**
 * Copies text to the clipboard using the async Clipboard API with a scoped
 * fallback that cleans up DOM state, clears the temporary buffer, and restores focus.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall back to temporary textarea selection below
  }

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const tempArea = document.createElement('textarea');
  tempArea.value = text;
  tempArea.setAttribute('readonly', '');
  tempArea.style.position = 'fixed';
  tempArea.style.opacity = '0';
  tempArea.style.pointerEvents = 'none';
  document.body.appendChild(tempArea);

  try {
    tempArea.select();
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    tempArea.value = '';
    document.body.removeChild(tempArea);
    previousFocus?.focus();
  }
}

