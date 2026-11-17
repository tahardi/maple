import { render, screen } from '@testing-library/react';
import { DescriptionView } from './DescriptionView';

describe('DescriptionView', () => {
  test('renders the text as Markdown', () => {
    // given
    // when
    render(<DescriptionView text={'## Summary\n\nHello'} />);
    // then
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
  });

  test('shows no overview strip', () => {
    // given
    // when
    render(<DescriptionView text={'## Summary\n\nHello'} />);
    // then
    expect(screen.queryByTestId('note-overview')).not.toBeInTheDocument();
  });
});
