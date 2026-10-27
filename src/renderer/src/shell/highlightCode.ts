import * as monaco from 'monaco-editor/editor/editor.api';
import '@renderer/card/viewer/monacoSetup';

export async function highlightCode(code: string, lang: string): Promise<string | null> {
  const tag = lang.toLowerCase();
  const language = monaco.languages
    .getLanguages()
    .find(
      (l) =>
        l.id === tag ||
        (l.aliases ?? []).some((alias) => alias.toLowerCase() === tag) ||
        (l.extensions ?? []).includes(`.${tag}`),
    );
  if (!language) {
    return null;
  }
  monaco.editor.setTheme('vs-dark');
  return monaco.editor.colorize(code, language.id, {});
}
