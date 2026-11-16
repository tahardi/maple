import { render, screen } from '@testing-library/react';
import { ExampleView } from './ExampleView';

describe('ExampleView', () => {
  test('highlights mark in the attack line', () => {
    // given
    const example = {
      lang: 'bash',
      normal: 'git checkout main',
      attack: 'git checkout x; rm -rf ~',
      mark: '; rm -rf ~',
    };
    // when
    render(<ExampleView example={example} />);
    // then
    expect(screen.getByText('git checkout main')).toBeInTheDocument();
    expect(screen.getByText('; rm -rf ~', { selector: 'mark' })).toBeInTheDocument();
    expect(screen.getByText('git checkout x', { exact: false, selector: 'span' })).toHaveTextContent(
      'git checkout x; rm -rf ~',
    );
  });
});
