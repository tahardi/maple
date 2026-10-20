import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeMaple } from '../testing/fakeMaple';
import { QuickOpen } from './QuickOpen';

const files = ['README.md', 'src/a.ts', 'src/card/CardTab.tsx'];

describe('QuickOpen', () => {
  test('files mode filters the file list and opens the chosen file', async () => {
    // given
    fakeMaple();
    const onOpen = vi.fn();
    render(<QuickOpen tabId="t1" files={files} mode="files" onOpen={onOpen} onClose={vi.fn()} />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'ts');
    // then
    expect(screen.getAllByRole('option').map((row) => row.textContent)).toEqual(['src/a.ts', 'src/card/CardTab.tsx']);
    expect(screen.getByRole('option', { name: 'src/a.ts' })).toHaveAttribute('aria-selected', 'true');
    // when
    await userEvent.keyboard('{ArrowDown}');
    // then
    expect(screen.getByRole('option', { name: 'src/card/CardTab.tsx' })).toHaveAttribute('aria-selected', 'true');
    // when
    await userEvent.keyboard('{Enter}');
    // then
    expect(onOpen).toHaveBeenCalledWith('src/card/CardTab.tsx', null);
  });

  test('text mode searches on Enter and opens the hit at its line', async () => {
    // given
    const search = vi.fn(() => Promise.resolve([{ path: 'src/a.ts', line: 3, text: 'the needle' }]));
    fakeMaple({ repo: { search } });
    const onOpen = vi.fn();
    render(<QuickOpen tabId="t1" files={files} mode="text" onOpen={onOpen} onClose={vi.fn()} />);
    // when
    await userEvent.type(screen.getByRole('textbox'), 'needle{Enter}');
    // then
    expect(search).toHaveBeenCalledWith('t1', 'needle');
    const hit = await screen.findByRole('option', { name: 'src/a.ts:3 the needle' });
    // when
    await userEvent.click(hit);
    // then
    expect(onOpen).toHaveBeenCalledWith('src/a.ts', 3);
  });

  test('Escape closes it', async () => {
    // given
    fakeMaple();
    const onClose = vi.fn();
    render(<QuickOpen tabId="t1" files={files} mode="files" onOpen={vi.fn()} onClose={onClose} />);
    // when
    await userEvent.keyboard('{Escape}');
    // then
    expect(onClose).toHaveBeenCalledOnce();
  });
});
