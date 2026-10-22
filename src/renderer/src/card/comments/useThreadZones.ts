import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Thread } from './commentThreads';

export type ThreadZone = { thread: Thread; node: HTMLElement };

type Box = { zone: HTMLElement; content: HTMLElement; height: number };

type Placed = { id: string; line: number; observer: ResizeObserver };

const FIRST_HEIGHT = 120;

function makeBox(): Box {
  const zone = document.createElement('div');
  zone.style.zIndex = '10';
  const content = document.createElement('div');
  content.style.display = 'flow-root';
  zone.appendChild(content);
  zone.addEventListener('keydown', (e) => {
    e.stopPropagation();
  });
  return { zone, content, height: FIRST_HEIGHT };
}

function place(code: editor.ICodeEditor, accessor: editor.IViewZoneChangeAccessor, box: Box, line: number): Placed {
  const zone: editor.IViewZone = { afterLineNumber: line, domNode: box.zone, heightInPx: box.height };
  const id = accessor.addZone(zone);
  const observer = new ResizeObserver(() => {
    const height = box.content.offsetHeight;
    if (height === 0 || height === zone.heightInPx) {
      return;
    }
    box.height = height;
    zone.heightInPx = height;
    code.changeViewZones((later) => {
      later.layoutZone(id);
    });
  });
  observer.observe(box.content);
  return { id, line, observer };
}

export function useThreadZones(code: editor.ICodeEditor | null, threads: readonly Thread[]): ThreadZone[] {
  const [boxes, setBoxes] = useState(() => new Map<number, Box>());
  if (threads.length !== boxes.size || threads.some((thread) => !boxes.has(thread.id))) {
    setBoxes(new Map(threads.map((thread) => [thread.id, boxes.get(thread.id) ?? makeBox()])));
  }
  const zones = useRef(new Map<Box, Placed>());

  const placed = useMemo(
    () =>
      threads.flatMap((thread) => {
        const box = boxes.get(thread.id);
        return box === undefined ? [] : [{ thread, box }];
      }),
    [threads, boxes],
  );

  useEffect(() => {
    if (code === null) {
      return;
    }
    const live = zones.current;
    return () => {
      for (const { observer } of live.values()) {
        observer.disconnect();
      }
      code.changeViewZones((accessor) => {
        for (const { id } of live.values()) {
          accessor.removeZone(id);
        }
      });
      live.clear();
    };
  }, [code]);

  useEffect(() => {
    if (code === null) {
      return;
    }
    const live = zones.current;
    const wanted = new Map(placed.map(({ thread, box }) => [box, thread.line]));
    code.changeViewZones((accessor) => {
      for (const [box, { id, line, observer }] of live) {
        if (wanted.get(box) !== line) {
          observer.disconnect();
          accessor.removeZone(id);
          live.delete(box);
        }
      }
      for (const [box, line] of wanted) {
        if (!live.has(box)) {
          live.set(box, place(code, accessor, box, line));
        }
      }
    });
  }, [code, placed]);

  return useMemo(() => placed.map(({ thread, box }) => ({ thread, node: box.content })), [placed]);
}
