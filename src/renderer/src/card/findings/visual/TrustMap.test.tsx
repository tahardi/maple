import { render, screen } from '@testing-library/react';
import { TrustMap } from './TrustMap';

const zones = ['the internet', 'GitHub', 'the app', 'the laptop'];

describe('TrustMap', () => {
  test('marks the from and to zones and says "crossed here"', () => {
    // given
    // when
    render(<TrustMap zones={zones} from="GitHub" to="the app" />);
    // then
    expect(screen.getByText('GitHub').closest('li')).toHaveAttribute('data-crossed', 'true');
    expect(screen.getByText('the app').closest('li')).toHaveAttribute('data-crossed', 'true');
    expect(screen.getByText('crossed here')).toHaveAttribute('data-crossed', 'true');
  });

  test('leaves the other zones unmarked', () => {
    // given
    // when
    render(<TrustMap zones={zones} from="GitHub" to="the app" />);
    // then
    expect(screen.getByText('the internet').closest('li')).toHaveAttribute('data-crossed', 'false');
    expect(screen.getByText('the laptop').closest('li')).toHaveAttribute('data-crossed', 'false');
    expect(screen.getAllByText('crossed here')).toHaveLength(1);
  });
});
