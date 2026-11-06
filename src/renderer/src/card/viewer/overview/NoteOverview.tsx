import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { MarkdownText } from '@renderer/shell/MarkdownText';
import { overviewScale, scrollTopAt } from './overviewScroll';
import styles from './NoteOverview.module.css';

type View = { scrollTop: number; clientWidth: number; clientHeight: number; scrollHeight: number };

export const OVERVIEW_WIDTH = 72;

function scrollNote(scroller: HTMLElement, top: number) {
  scroller.scrollTop = top;
}

export function NoteOverview({ text, scroller }: { text: string; scroller: HTMLElement | null }) {
  const [view, setView] = useState<View | null>(null);
  const pressed = useRef(false);
  const copy = useMemo(() => <MarkdownText text={text} />, [text]);

  useEffect(() => {
    if (scroller === null) {
      return;
    }
    const measure = () => {
      const { scrollTop, clientWidth, clientHeight, scrollHeight } = scroller;
      setView({ scrollTop, clientWidth, clientHeight, scrollHeight });
    };
    measure();
    scroller.addEventListener('scroll', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [scroller, text]);

  if (scroller === null || view === null) {
    return null;
  }

  const { scrollTop, clientWidth, clientHeight, scrollHeight } = view;
  const scale = overviewScale(
    { width: clientWidth, height: scrollHeight },
    { width: OVERVIEW_WIDTH, height: clientHeight },
  );

  const jump = (e: MouseEvent<HTMLDivElement>) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    scrollNote(scroller, scrollTopAt(y, scale, clientHeight, scrollHeight - clientHeight));
  };

  const release = () => {
    pressed.current = false;
  };

  return (
    <div
      data-testid="note-overview"
      aria-hidden="true"
      className={styles.strip}
      onMouseDown={(e) => {
        if (e.button === 0) {
          pressed.current = true;
          jump(e);
        }
      }}
      onMouseMove={(e) => {
        if (pressed.current && e.buttons === 1) {
          jump(e);
        }
      }}
      onMouseUp={release}
      onMouseLeave={release}
    >
      <div inert className={styles.page} style={{ width: clientWidth, transform: `scale(${String(scale)})` }}>
        {copy}
      </div>
      <div
        data-testid="note-overview-slider"
        className={styles.slider}
        style={{ top: scrollTop * scale, height: clientHeight * scale }}
      />
    </div>
  );
}
