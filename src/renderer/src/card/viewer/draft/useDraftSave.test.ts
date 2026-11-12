import { act, renderHook } from '@testing-library/react';
import { useMaple } from '@renderer/store';
import { useDraftSave } from './useDraftSave';

describe('useDraftSave', () => {
  beforeEach(() => {
    useMaple.setState(useMaple.getInitialState(), true);
  });

  test('clears the draft once the write succeeds', async () => {
    // given
    useMaple.getState().setDraft('t1', 'src/a.ts', { text: 'two\n', disk: 'one\n' });
    const saved = vi.fn();
    const { result } = renderHook(() => useDraftSave('t1'));
    // when
    await act(async () => {
      result.current.persist('src/a.ts', Promise.resolve(), saved);
      await Promise.resolve();
    });
    // then
    expect(saved).toHaveBeenCalledOnce();
    expect(useMaple.getState().drafts.t1).toEqual({});
    expect(result.current.saveError).toBeNull();
  });

  test('keeps the draft and reports the error when the write fails', async () => {
    // given
    const draft = { text: 'two\n', disk: 'one\n' };
    useMaple.getState().setDraft('t1', 'src/a.ts', draft);
    const saved = vi.fn();
    const write = Promise.reject(
      new Error("Error invoking remote method 'repo:writeFile': Error: writing src/a.ts: EACCES"),
    );
    const { result } = renderHook(() => useDraftSave('t1'));
    // when
    await act(async () => {
      result.current.persist('src/a.ts', write, saved);
      await Promise.resolve();
    });
    // then
    expect(saved).not.toHaveBeenCalled();
    expect(useMaple.getState().drafts.t1['src/a.ts']).toEqual(draft);
    expect(result.current.saveError).toEqual({ path: 'src/a.ts', message: 'writing src/a.ts: EACCES' });
  });
});
