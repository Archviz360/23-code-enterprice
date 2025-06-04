import { render, screen } from '@testing-library/react';
import { Toolbar } from './Toolbar';

test('renders New File button', () => {
  render(<Toolbar />);
  expect(screen.getByText(/New File/i)).toBeInTheDocument();
});
