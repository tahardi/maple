import { useEffect, useState } from 'react';

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [result, setResult] = useState<{ code: string; lang: string; html: string } | null>(null);

  useEffect(() => {
    let live = true;
    import('./highlightCode')
      .then((m) => m.highlightCode(code, lang))
      .then((html) => {
        if (live && html !== null) {
          setResult({ code, lang, html });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code, lang]);

  if (result?.code === code && result.lang === lang) {
    // eslint-disable-next-line no-restricted-syntax -- Monaco's colorizer escapes the source text
    return <code dangerouslySetInnerHTML={{ __html: result.html }} />;
  }
  return <code>{code}</code>;
}
