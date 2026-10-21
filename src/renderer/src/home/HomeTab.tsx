import type { TabState } from '@shared/types';
import { useCallback, useState } from 'react';
import { ConfirmDialog } from '../shell/ConfirmDialog';
import { useMaple } from '../store';
import { Backlog } from './Backlog';
import { Board } from './Board';
import { Capacity } from './Capacity';
import { CardDetail } from './CardDetail';
import styles from './HomeTab.module.css';
import { PlannerPane } from './PlannerPane';
import { readyToStart } from './readyToStart';
import { useBacklog } from './useBacklog';
import { usePlannedPoints } from './usePlannedPoints';
import { useSprint } from './useSprint';

type Props = { projectKey: string };

function staleMessage(fetchedAt: string | null): string {
  if (fetchedAt === null) {
    return 'Jira unreachable';
  }
  const at = new Date(fetchedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Jira unreachable, last updated ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

function failureMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}

export function HomeTab({ projectKey }: Props) {
  const { sprint, refresh: refreshSprint } = useSprint(projectKey);
  const { backlog, refresh: refreshBacklog } = useBacklog(projectKey);
  const { rows: plannedRows, refresh: refreshPoints } = usePlannedPoints();
  const reviewPoints = useMaple((s) => s.config?.data?.reviewPoints);
  const tabs = useMaple((s) => s.tabs);
  const activate = useMaple((s) => s.activate);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [startFailure, setStartFailure] = useState<string | null>(null);
  const [suggested, setSuggested] = useState<readonly string[]>([]);
  const [confirming, setConfirming] = useState<'accept' | 'acceptAndStart' | null>(null);
  const [moveFailure, setMoveFailure] = useState<string | null>(null);
  const backlogToDo = backlog?.data?.flatMap((g) => g.cards).filter((c) => c.status === 'To Do') ?? [];
  const accepting = backlogToDo.filter((c) => suggested.includes(c.key));
  const toAccept = accepting.map((c) => c.key);
  const planned = plannedRows.reduce((sum, row) => sum + row.planned, 0);
  const roomPoints = Math.max(0, (reviewPoints ?? 0) - planned);
  const toDo = sprint?.data?.cards.filter((c) => c.status === 'To Do') ?? [];
  const selected = toDo.map((c) => c.key).filter((key) => picked.includes(key));
  const openKeys = new Set(tabs.filter((t) => t.projectKey === projectKey).flatMap((t) => t.cardKey ?? []));
  const ready = readyToStart(toDo, openKeys);
  const card = sprint?.data?.cards.find((c) => c.key === detailKey) ?? null;
  const tabFor = (key: string) =>
    tabs.find((t) => t.kind === 'card' && t.projectKey === projectKey && t.cardKey === key) ?? null;
  const activateTab = (tab: TabState) => {
    activate(tab.id);
  };
  const select = (key: string) => {
    setDetailKey(key);
    setFailure(null);
  };
  const run = (action: Promise<TabState>) => {
    action
      .then((tab) => {
        setFailure(null);
        activateTab(tab);
      })
      .catch((err: unknown) => {
        setFailure(failureMessage(err));
      });
  };
  const toggle = (key: string) => {
    setPicked(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };
  const start = async (keys: readonly string[]) => {
    setStartFailure(null);
    const started: TabState[] = [];
    for (const [i, key] of keys.entries()) {
      try {
        started.push(await window.maple.tabs.startCard(projectKey, key));
      } catch (err: unknown) {
        setStartFailure(`starting ${key}: ${failureMessage(err)}`);
        setPicked(keys.slice(i));
        return;
      }
    }
    setPicked([]);
    if (started[0]) {
      activateTab(started[0]);
    }
  };

  const onBatch = useCallback((keys: string[]) => {
    setPicked(keys);
    setSuggested(keys);
  }, []);
  const accept = async (andStart: boolean) => {
    setConfirming(null);
    setMoveFailure(null);
    const sprintId = sprint?.data?.id;
    if (sprintId === undefined) {
      setMoveFailure('moving cards to sprint: no active sprint');
      return;
    }
    const startKeys = [...selected, ...toAccept];
    try {
      await window.maple.jira.moveToSprint(sprintId, toAccept);
    } catch (err: unknown) {
      setMoveFailure(failureMessage(err));
      return;
    }
    refreshSprint();
    refreshBacklog();
    refreshPoints();
    if (andStart) {
      await start(startKeys);
    }
  };

  return (
    <div className={styles.home} data-testid="home">
      <div className={styles.main}>
        {reviewPoints !== undefined && plannedRows.length > 0 && (
          <Capacity rows={plannedRows} reviewPoints={reviewPoints} />
        )}
        {sprint && sprint.error !== null && (
          <div role="status" className={styles.stale}>
            {staleMessage(sprint.fetchedAt)}
          </div>
        )}
        {sprint?.data ? (
          <Board sprint={sprint.data} selected={new Set(selected)} onSelect={select} onToggle={toggle} />
        ) : (
          sprint?.error === null && <p className={styles.empty}>No active sprint</p>
        )}
        {backlog?.data && <Backlog groups={backlog.data} highlighted={toAccept} />}
      </div>
      {card && (
        <CardDetail
          card={card}
          tab={tabFor(card.key)}
          failure={failure}
          onStart={() => {
            run(window.maple.tabs.startCard(projectKey, card.key));
          }}
          onOpen={() => {
            run(window.maple.tabs.openCard(projectKey, card.key));
          }}
          onGoTo={() => {
            const tab = tabFor(card.key);
            if (tab) {
              activateTab(tab);
            }
          }}
          onClose={() => {
            setDetailKey(null);
          }}
        />
      )}
      <PlannerPane
        projectKey={projectKey}
        onBatch={onBatch}
        selected={selected}
        readyCount={ready.length}
        onSelectReady={() => {
          setPicked(ready.every((key) => selected.includes(key)) ? [] : [...new Set([...selected, ...ready])]);
        }}
        onStart={() => void start(selected)}
        onClear={() => {
          setPicked([]);
          setStartFailure(null);
          setMoveFailure(null);
        }}
        toAccept={toAccept}
        onAccept={() => {
          setConfirming('accept');
        }}
        onAcceptAndStart={() => {
          setConfirming('acceptAndStart');
        }}
        failure={moveFailure ?? startFailure}
        roomPoints={roomPoints}
      />
      {confirming && (
        <ConfirmDialog
          title={confirming === 'accept' ? 'Accept cards' : 'Accept and start cards'}
          body={`Move into ${sprint?.data?.name ?? 'the sprint'}: ${accepting.map((c) => `${c.key} ${c.summary}`).join('; ')}`}
          confirmLabel={confirming === 'accept' ? 'Move to sprint' : 'Move and start'}
          onConfirm={() => void accept(confirming === 'acceptAndStart')}
          onCancel={() => {
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}
