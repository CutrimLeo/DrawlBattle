/** Copy from a click/keyboard gesture, including HTTP LAN pages without Clipboard API. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission can be denied even on HTTPS; try the browser's selection-based copy.
  }
  return copySelection(text);
}

function copySelection(text: string): boolean {
  const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const input = focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement ? focused : null;
  const inputSelection = input ? { start: input.selectionStart, end: input.selectionEnd, direction: input.selectionDirection } : null;
  const selection = window.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.setAttribute('aria-hidden', 'true');
  Object.assign(textarea.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', padding: '0', border: '0', opacity: '0', fontSize: '16px' });
  try {
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (focused?.isConnected) {
      focused.focus({ preventScroll: true });
      if (input && inputSelection?.start != null && inputSelection.end != null) {
        input.setSelectionRange(inputSelection.start, inputSelection.end, inputSelection.direction ?? undefined);
      }
    }
    if (selection) {
      selection.removeAllRanges();
      for (const range of ranges) selection.addRange(range);
    }
  }
}
