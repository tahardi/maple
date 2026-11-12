import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import type { Tone } from './tone';

describe('Badge', () => {
  test.each([
    { name: 'no tone', tone: undefined, want: 'neutral' },
    { name: 'success', tone: 'success', want: 'success' },
    { name: 'danger', tone: 'danger', want: 'danger' },
  ] satisfies { name: string; tone: Tone | undefined; want: string }[])(
    'a $name badge has tone $want',
    ({ tone, want }) => {
      // given
      const text = 'In Progress';
      // when
      render(<Badge tone={tone}>{text}</Badge>);
      // then
      expect(screen.getByText(text)).toHaveAttribute('data-tone', want);
    },
  );
});
