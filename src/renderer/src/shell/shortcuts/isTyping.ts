const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];

export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return (
    TYPING_TAGS.includes(target.tagName) ||
    target.closest('.monaco-editor, .xterm, [contenteditable]:not([contenteditable="false"])') !== null
  );
}
