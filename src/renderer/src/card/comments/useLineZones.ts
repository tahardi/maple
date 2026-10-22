import type { editor } from 'monaco-editor/editor/editor.api';
import { useEffect, useMemo, useRef, useState } from 'react';

export type LineZone<T> = { item: T; node: HTMLElement };

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

export function useLineZones<T extends { id: number | string; line: number }>(
  code: editor.ICodeEditor | null,
  items: readonly T[],
): LineZone<T>[] {
  const [boxes, setBoxes] = useState(() => new Map<number | string, Box>());
  if (items.length !== boxes.size || items.some((item) => !boxes.has(item.id))) {
    setBoxes(new Map(items.map((item) => [item.id, boxes.get(item.id) ?? makeBox()])));
  }
  const zones = useRef(new Map<Box, Placed>());

  const placed = useMemo(
    () =>
      items.flatMap((item) => {
        const box = boxes.get(item.id);
        return box === undefined ? [] : [{ item, box }];
      }),
    [items, boxes],
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
    const wanted = new Map(placed.map(({ item, box }) => [box, item.line]));
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

  return useMemo(() => placed.map(({ item, box }) => ({ item, node: box.content })), [placed]);
}
