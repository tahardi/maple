import type { Card } from '@shared/types/jira/card';
import type { TabState } from '@shared/types/tabs/tabState';
import { useCallback, useRef, useState } from 'react';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { useMaple } from '../store';
import { Backlog } from '@renderer/home/backlog/Backlog';
import { Board } from './Board';
import { CardDetail } from './CardDetail';
import { Notice } from '@renderer/shell/blocks/Notice';
import styles from './HomeTab.module.css';
import { PlannerPane } from './PlannerPane';
import { readyToStart } from '@renderer/home/startQueue/readyToStart';
import { StartQueue } from '@renderer/home/startQueue/StartQueue';
import { useBacklog } from '@renderer/home/backlog/useBacklog';
import { useSprint } from './useSprint';
import { useStartQueue } from '@renderer/home/startQueue/useStartQueue';
import { errorText } from '@shared/errors/errorText';
import { SplitHandle } from '@renderer/shell/split/SplitHandle';
import { splitSize } from '@renderer/shell/split/splitSize';
import { useColumnDrag } from '@renderer/shell/split/useColumnDrag';

type Props = { projectKey: string };

function staleMessage(fetchedAt: string | null): string {
  if (fetchedAt === null) {
    return 'Jira unreachable';
  }
  const at = new Date(fetchedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Jira unreachable, last updated ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function addBody(card: Card, sprintName: string): string {
  const blockers = card.blockedBy.filter((b) => b.status !== 'Done').map((b) => b.key);
  const blocked = blockers.length > 0 ? ` Blocked by ${blockers.join(', ')}.` : '';
  return `Move ${card.key} ${card.summary} into ${sprintName}?${blocked}`;
}

export function HomeTab({ projectKey }: Props) {
  const { sprint, refresh: refreshSprint } = useSprint(projectKey);
  const { backlog, refresh: refreshBacklog } = useBacklog(projectKey);
  const tabs = useMaple((s) => s.tabs);
  const queue = useStartQueue();
  const activate = useMaple((s) => s.activate);
  const home = useRef<HTMLDivElement>(null);
  const main = useRef<HTMLDivElement>(null);
  const planner = useColumnDrag(home, {
    storageKey: 'maple.split.homePlanner',
    initial: 40,
    min: 20,
    max: 70,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'x', edge: 'end', unit: '%', min: 20, max: 70 }),
  });
  const backlogDrag = useColumnDrag(main, {
    storageKey: 'maple.split.homeBacklog',
    initial: 40,
    min: 10,
    max: 80,
    toSize: (rect, p) =>
      splitSize(rect, { x: p.clientX, y: p.clientY }, { axis: 'y', edge: 'end', unit: '%', min: 10, max: 80 }),
  });
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [suggested, setSuggested] = useState<readonly string[]>([]);
  const [confirming, setConfirming] = useState<'accept' | 'acceptAndStart' | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [batch, setBatch] = useState<'start' | 'accept' | 'acceptAndStart' | null>(null);
  const backlogCards = backlog?.data?.flatMap((g) => g.cards) ?? [];
  const backlogToDo = backlogCards.filter((c) => c.status === 'To Do');
  const accepting = backlogToDo.filter((c) => suggested.includes(c.key));
  const toAccept = accepting.map((c) => c.key);
  const refineCount = [...(sprint?.data?.cards ?? []), ...backlogCards].filter(
    (c) => c.status !== 'Done' && c.labels.includes('needs-refinement'),
  ).length;
  const toDo = sprint?.data?.cards.filter((c) => c.status === 'To Do') ?? [];
  const queuedKeys = queue.cards.map((c) => c.cardKey);
  const titles = new Map([...(sprint?.data?.cards ?? []), ...backlogCards].map((c) => [c.key, c.summary]));
  const selected = toDo.map((c) => c.key).filter((key) => picked.includes(key) && !queuedKeys.includes(key));
  const openKeys = new Set([
    ...tabs.filter((t) => t.projectKey === projectKey).flatMap((t) => t.cardKey ?? []),
    ...queuedKeys,
  ]);
  const ready = readyToStart(toDo, openKeys);
  const sprintCard = sprint?.data?.cards.find((c) => c.key === detailKey) ?? null;
  const backlogCard = sprintCard ? null : (backlogCards.find((c) => c.key === detailKey) ?? null);
  const card = sprintCard ?? backlogCard;
  const confirmCard = backlogCards.find((c) => c.key === confirmKey) ?? null;
  const activeSprint = sprint?.data ?? null;
  const tabFor = (key: string) =>
    tabs.find((t) => t.kind === 'card' && t.projectKey === projectKey && t.cardKey === key) ?? null;
  const activateTab = (tab: TabState) => {
    activate(tab.id);
  };
  const select = (key: string) => {
    setDetailKey(key);
  };
  const closeDetail = () => {
    if (confirmKey === null && confirming === null) {
      setDetailKey(null);
    }
  };
  const markBusy = (keys: readonly string[], busy: boolean) => {
    setBusyKeys((now) => {
      const next = new Set(now);
      for (const key of keys) {
        if (busy) {
          next.add(key);
        } else {
          next.delete(key);
        }
      }
      return next;
    });
  };
  const run = (key: string, action: Promise<TabState | null>) => {
    markBusy([key], true);
    action
      .then((tab) => {
        setFailure(null);
        if (tab) {
          activateTab(tab);
        }
      })
      .catch((err: unknown) => {
        setFailure(errorText(err));
      })
      .finally(() => {
        markBusy([key], false);
      });
  };
  const toggle = (key: string) => {
    setPicked(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  const start = async (keys: readonly string[]): Promise<readonly string[]> => {
    setFailure(null);
    markBusy(keys, true);
    const started: TabState[] = [];
    try {
      for (const [i, key] of keys.entries()) {
        try {
          const tab = await window.maple.tabs.startCard(projectKey, key);
          if (tab) {
            started.push(tab);
          }
        } catch (err: unknown) {
          setFailure(`starting ${key}: ${errorText(err)}`);
          return keys.slice(i);
        }
      }
    } finally {
      markBusy(keys, false);
    }
    if (started[0]) {
      activateTab(started[0]);
    }
    return [];
  };
  const startSelected = async (keys: readonly string[]) => {
    setPicked(await start(keys));
  };

  const onBatch = useCallback((keys: string[]) => {
    setPicked(keys);
    setSuggested(keys);
  }, []);
  const accept = async (andStart: boolean) => {
    setConfirming(null);
    setFailure(null);
    const sprintId = sprint?.data?.id;
    if (sprintId === undefined) {
      setFailure('moving cards to sprint: no active sprint');
      return;
    }
    const startKeys = [...selected, ...toAccept];
    try {
      await window.maple.jira.moveToSprint(sprintId, toAccept);
    } catch (err: unknown) {
      setFailure(errorText(err));
      return;
    }
    refreshSprint();
    refreshBacklog();
    if (andStart) {
      await startSelected(startKeys);
    }
  };
  const addToSprint = async (key: string, sprintId: number) => {
    setConfirmKey(null);
    setFailure(null);
    try {
      await window.maple.jira.moveToSprint(sprintId, [key]);
    } catch (err: unknown) {
      setFailure(errorText(err));
      return;
    }
    refreshSprint();
    refreshBacklog();
  };
  const onAddToSprint = activeSprint
    ? () => {
        setConfirmKey(detailKey);
      }
    : null;

  return (
    <div ref={home} className={styles.home} data-testid="home">
      <div ref={main} className={styles.main} data-testid="board-area" onPointerDown={closeDetail}>
        {sprint === null && (
          <p role="status" className={styles.empty}>
            Loading sprint…
          </p>
        )}
        {sprint && sprint.error !== null && <Notice tone="warning">{staleMessage(sprint.fetchedAt)}</Notice>}
        {sprint?.data ? (
          <Board
            projectKey={projectKey}
            sprint={sprint.data}
            selected={new Set(selected)}
            onSelect={select}
            onToggle={toggle}
            openKeys={openKeys}
            starting={busyKeys}
            onStart={(key) => {
              void start([key]);
            }}
            queued={queuedKeys}
            status={<StartQueue queue={queue} titles={titles} />}
          />
        ) : (
          sprint?.error === null && <p className={styles.empty}>No active sprint</p>
        )}
        {backlog?.data && (
          <Backlog
            groups={backlog.data}
            highlighted={toAccept}
            queued={queuedKeys}
            onSelect={select}
            drag={backlogDrag}
          />
        )}
        {card && (
          <CardDetail
            card={card}
            tab={tabFor(card.key)}
            busy={busyKeys.has(card.key)}
            onStart={() => {
              void start([card.key]);
            }}
            onOpen={() => {
              run(card.key, window.maple.tabs.openCard(projectKey, card.key));
            }}
            onGoTo={() => {
              const tab = tabFor(card.key);
              if (tab) {
                activateTab(tab);
              }
            }}
            onClose={closeDetail}
            onAddToSprint={backlogCard ? onAddToSprint : undefined}
            queuePlace={queuedKeys.includes(card.key) ? queuedKeys.indexOf(card.key) + 1 : undefined}
          />
        )}
      </div>
      <SplitHandle drag={planner} axis="x" label="Resize planner" />
      <PlannerPane
        projectKey={projectKey}
        width={planner.size}
        onBatch={onBatch}
        selected={selected}
        readyCount={ready.length}
        refineCount={refineCount}
        onSelectReady={() => {
          setPicked(ready.every((key) => selected.includes(key)) ? [] : [...new Set([...selected, ...ready])]);
        }}
        onStart={() => {
          setBatch('start');
          void startSelected(selected).finally(() => {
            setBatch(null);
          });
        }}
        onClear={() => {
          setPicked([]);
          setFailure(null);
        }}
        toAccept={toAccept}
        onAccept={() => {
          setConfirming('accept');
        }}
        onAcceptAndStart={() => {
          setConfirming('acceptAndStart');
        }}
        failure={failure ?? queue.failure}
        busy={batch}
      />
      {confirming && (
        <ConfirmDialog
          title={confirming === 'accept' ? 'Accept cards' : 'Accept and start cards'}
          body={`Move into ${sprint?.data?.name ?? 'the sprint'}: ${accepting.map((c) => `${c.key} ${c.summary}`).join('; ')}`}
          confirmLabel={confirming === 'accept' ? 'Move to sprint' : 'Move and start'}
          onConfirm={() => {
            setBatch(confirming);
            void accept(confirming === 'acceptAndStart').finally(() => {
              setBatch(null);
            });
          }}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      )}
      {confirmCard && activeSprint && (
        <ConfirmDialog
          title="Add to sprint"
          body={addBody(confirmCard, activeSprint.name)}
          confirmLabel="Move to sprint"
          onConfirm={() => {
            const key = confirmCard.key;
            markBusy([key], true);
            void addToSprint(key, activeSprint.id).finally(() => {
              markBusy([key], false);
            });
          }}
          onCancel={() => {
            setConfirmKey(null);
          }}
        />
      )}
    </div>
  );
}
