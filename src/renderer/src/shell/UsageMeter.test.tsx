import { act, render, screen } from '@testing-library/react';
import type { Usage } from '@shared/types';
import { fakeMaple } from '../testing/fakeMaple';
import { UsageMeter } from './UsageMeter';

const now = new Date(2026, 9, 20, 12, 0);
const seconds = (date: Date) => date.getTime() / 1000;
const fiveHour = { usedPercentage: 42.4, resetsAt: seconds(new Date(2026, 9, 20, 14, 20)) };
const sevenDay = { usedPercentage: 18, resetsAt: seconds(new Date(2026, 9, 22, 9, 0)) };
const expired = { usedPercentage: 90, resetsAt: seconds(new Date(2026, 9, 20, 11, 0)) };

function setup(usage: Usage | null) {
  let push: (u: Usage) => void = () => undefined;
  fakeMaple({
    app: {
      usage: () => Promise.resolve(usage),
      onUsage: (cb) => {
        push = cb;
        return () => undefined;
      },
    },
  });
  const { container } = render(<UsageMeter />);
  return {
    container,
    push: (u: Usage) => {
      act(() => {
        push(u);
      });
    },
  };
}

describe('UsageMeter', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.each([
    {
      name: 'both windows',
      usage: { fiveHour, sevenDay },
      text: '5h 42% · 7d 18%',
      title: '5h resets 14:20 · 7d resets Thu 09:00',
    },
    {
      name: 'only the window that has not reset',
      usage: { fiveHour: expired, sevenDay },
      text: '7d 18%',
      title: '7d resets Thu 09:00',
    },
  ])('shows $name', async ({ usage, text, title }) => {
    // given
    setup(usage);
    // when
    const meter = await screen.findByTitle(title);
    // then
    expect(meter).toHaveTextContent(text);
  });

  test.each([
    { name: 'null usage', usage: null },
    { name: 'only reset windows', usage: { fiveHour: expired, sevenDay: null } },
  ])('renders nothing for $name', async ({ usage }) => {
    // given
    const { container } = setup(usage);
    // when
    await act(() => Promise.resolve());
    // then
    expect(container).toBeEmptyDOMElement();
  });

  test('a pushed usage replaces the first one', async () => {
    // given
    const { push } = setup({ fiveHour, sevenDay });
    await screen.findByTitle('5h resets 14:20 · 7d resets Thu 09:00');
    // when
    push({ fiveHour: { ...fiveHour, usedPercentage: 50.6 }, sevenDay: null });
    // then
    expect(screen.getByTitle('5h resets 14:20')).toHaveTextContent('5h 51%');
  });

  test('hides a window once it resets', async () => {
    // given
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(now);
    setup({ fiveHour, sevenDay });
    await act(() => Promise.resolve());
    // when
    act(() => {
      vi.advanceTimersByTime(2.5 * 60 * 60 * 1000);
    });
    // then
    expect(screen.getByTitle('7d resets Thu 09:00')).toHaveTextContent('7d 18%');
  });
});
