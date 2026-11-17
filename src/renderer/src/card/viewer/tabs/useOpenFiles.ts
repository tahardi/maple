import { useWorktreeState } from '@renderer/card/useWorktreeState';
import { CARD_DESCRIPTION } from './cardDescription';
import { closeFiles } from './closeFiles';
import { close, openPreview, pin, type OpenFileList } from './openFileList';
import { PR_DESCRIPTION } from './prDescription';

type Descriptions = { pr: boolean; card: boolean };

type State = { list: OpenFileList; activeFile: string | null; line: number | null; opened: Descriptions };

export type OpenFiles = {
  files: readonly string[];
  preview: string | null;
  activeFile: string | null;
  line: number | null;
  open: (path: string, at?: number | null, keep?: boolean) => void;
  pin: (path: string) => void;
  activate: (path: string | null) => void;
  close: (paths: readonly string[]) => void;
};

const INITIAL: State = {
  list: { files: [], preview: null },
  activeFile: null,
  line: null,
  opened: { pr: false, card: false },
};

function withDescription(state: State, kind: keyof Descriptions, path: string): State {
  return {
    ...state,
    list: { ...state.list, files: [path, ...state.list.files] },
    activeFile: state.activeFile ?? path,
    opened: { ...state.opened, [kind]: true },
  };
}

function withDescriptions(state: State, descriptions: Descriptions): State {
  const withPr = descriptions.pr && !state.opened.pr ? withDescription(state, 'pr', PR_DESCRIPTION) : state;
  return descriptions.card && !withPr.opened.card ? withDescription(withPr, 'card', CARD_DESCRIPTION) : withPr;
}

export function useOpenFiles(worktreePath: string | null, descriptions: Descriptions): OpenFiles {
  const [stored, setStored] = useWorktreeState(worktreePath, INITIAL);
  const state = withDescriptions(stored, descriptions);
  const update = (change: (now: State) => State) => {
    setStored((now) => change(withDescriptions(now, descriptions)));
  };

  return {
    files: state.list.files,
    preview: state.list.preview,
    activeFile: state.activeFile,
    line: state.line,
    open: (path, at = null, keep = false) => {
      update((now) => ({
        ...now,
        list: keep ? pin(now.list, path) : openPreview(now.list, path),
        activeFile: path,
        line: at,
      }));
    },
    pin: (path) => {
      update((now) => ({ ...now, list: pin(now.list, path) }));
    },
    activate: (path) => {
      update((now) => ({ ...now, activeFile: path, line: null }));
    },
    close: (paths) => {
      update((now) => {
        const next = closeFiles(now.list.files, now.activeFile, paths);
        const moved = next.activeFile !== now.activeFile;
        return {
          ...now,
          list: close(now.list, paths),
          activeFile: next.activeFile,
          line: moved ? null : now.line,
        };
      });
    },
  };
}
