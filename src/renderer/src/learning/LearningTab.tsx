import type { TabState } from '@shared/types/tabs/tabState';
import { useRef, useState } from 'react';
import { ClaudePane } from '@renderer/claude/ClaudePane';
import { FileViewer } from '@renderer/card/viewer/FileViewer';
import { VAULT_PREFIX } from '@renderer/card/vault/VaultSwitch';
import { Notice } from '@renderer/shell/blocks/Notice';
import { SplitHandle } from '@renderer/shell/split/SplitHandle';
import { splitSize } from '@renderer/shell/split/splitSize';
import { useColumnDrag } from '@renderer/shell/split/useColumnDrag';
import { LessonList } from './LessonList';
import { useLessons } from './useLessons';
import styles from './LearningTab.module.css';

export function LearningTab({ tab }: { tab: TabState }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { lessons, error, reload } = useLessons();
  const body = useRef<HTMLDivElement>(null);
  const left = useColumnDrag(body, {
    storageKey: 'maple.split.learningList',
    initial: 320,
    min: 200,
    max: 600,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'start', unit: 'px', min: 200, max: 600 }),
  });
  const right = useColumnDrag(body, {
    storageKey: 'maple.split.learningClaude',
    initial: 32,
    min: 10,
    max: 80,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'end', unit: '%', min: 10, max: 80 }),
  });
  const file = selected === null ? null : `${VAULT_PREFIX}${selected}`;

  return (
    <div ref={body} className={styles.tab} data-testid="learning-tab">
      <div className={styles.left} style={{ width: left.size }}>
        {error !== null && <Notice tone="danger">{error}</Notice>}
        {(error === null || lessons.length > 0) && (
          <LessonList lessons={lessons} selected={selected} onSelect={setSelected} onSaved={reload} />
        )}
      </div>
      <SplitHandle drag={left} axis="x" label="Resize lesson list" />
      <div className={styles.middle}>
        <FileViewer
          tabId={tab.id}
          openFiles={file === null ? [] : [file]}
          activeFile={file}
          onActivate={() => undefined}
          onCloseFiles={() => {
            setSelected(null);
          }}
          prBody={null}
          canComment={false}
          prFetchedAt={null}
          line={null}
        />
      </div>
      <SplitHandle drag={right} axis="x" label="Resize Claude pane" />
      <div className={styles.right} style={{ width: `${String(right.size)}%` }} data-testid="claude-slot">
        <ClaudePane tabId={tab.id} actions={[]} />
      </div>
    </div>
  );
}
