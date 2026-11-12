export type Shortcut = { keys: string; action: string };

export const SHORTCUTS: readonly Shortcut[] = [
  { keys: 'Ctrl+Tab', action: 'Next tab' },
  { keys: 'Ctrl+Shift+Tab', action: 'Previous tab' },
  { keys: 'Ctrl+Shift+W', action: 'Close card tab' },
  { keys: 'Ctrl+P', action: 'Open a file' },
  { keys: 'Ctrl+Shift+F', action: 'Search text' },
  { keys: 'Ctrl+`', action: 'Show or hide the terminal' },
  { keys: 'Ctrl+S', action: 'Save the file' },
  { keys: 'Ctrl+Shift+C', action: 'Copy in a terminal' },
  { keys: 'Ctrl+Shift+R', action: 'Reload config' },
  { keys: 'Ctrl+Plus / Ctrl+- / Ctrl+0', action: 'Zoom in, out, or reset' },
  { keys: '?', action: 'This list' },
];
