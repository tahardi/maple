import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  test('shows the app name', () => {
    // given
    render(<App />);
    // then
    expect(screen.getByTestId('app-title')).toHaveTextContent('Maple');
  });
});
