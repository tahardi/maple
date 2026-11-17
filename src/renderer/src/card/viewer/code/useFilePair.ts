import { errorText } from '@shared/errors/errorText';
import type { FilePair } from '@shared/types/files/filePair';
import type { Review } from '@shared/types/github/review';
import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useMaple } from '@renderer/store';

export function useFilePair(
  tabId: string,
  path: string,
  review: Review | null,
  scroller: RefObject<editor.ICodeEditor | null>,
): {
  pair: FilePair | null;
  readError: { path: string; message: string } | null;
  setPair: (pair: FilePair) => void;
} {
  const [pair, setPair] = useState<FilePair | null>(null);
  const [readError, setReadError] = useState<{ path: string; message: string } | null>(null);
  const keepScroll = useRef<number | null>(null);
  const loadedFile = useRef<string | null>(null);
  const active = useMaple((s) => s.activeTabId === tabId);
  const headSha = review?.headSha ?? null;
  const baseSha = review?.baseSha ?? null;
  const watching = active || (headSha !== null && baseSha !== null);
  const reviewOldPath = review?.files.find((f) => f.path === path)?.oldPath ?? null;

  useEffect(() => {
    let live = true;
    if (headSha !== null && baseSha !== null) {
      window.maple.pr.readFile(tabId, path, reviewOldPath, baseSha, headSha).then(
        (next) => {
          if (live) {
            setReadError(null);
            setPair(next);
          }
        },
        (err: unknown) => {
          if (live) {
            setReadError({ path, message: errorText(err) });
          }
        },
      );
      return () => {
        live = false;
      };
    }
    const load = (keep: boolean) => {
      const top = keep ? (scroller.current?.getScrollTop() ?? null) : null;
      void window.maple.repo.readFile(tabId, path).then((next) => {
        if (live) {
          keepScroll.current = top;
          loadedFile.current = path;
          setPair(next);
        }
      });
    };
    const reload = loadedFile.current === path;
    if (watching || !reload) {
      load(reload);
    }
    if (!watching) {
      return () => {
        live = false;
      };
    }
    const unsubscribe = window.maple.repo.onChanged(tabId, () => {
      load(true);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [watching, tabId, path, headSha, baseSha, reviewOldPath, scroller]);

  useEffect(() => {
    if (keepScroll.current !== null) {
      scroller.current?.setScrollTop(keepScroll.current);
      keepScroll.current = null;
    }
  }, [pair, scroller]);

  return { pair, readError, setPair };
}
