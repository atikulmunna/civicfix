import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { reportClientError } = vi.hoisted(() => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/report-error', () => ({ reportClientError }));

import RouteError from '@/app/error';

describe('route error boundary', () => {
  beforeEach(() => {
    reportClientError.mockReset();
  });

  it('explains the failure, reports it once and offers a retry', async () => {
    const retry = vi.fn();
    const boom = new Error('render failed');
    render(<RouteError error={boom} retry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(boom);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the server digest as a reference, and nothing else from the error', () => {
    const fromServer = Object.assign(new Error('secret internal detail'), { digest: '2817443' });
    render(<RouteError error={fromServer} retry={vi.fn()} />);

    expect(screen.getByText('2817443')).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
  });

  it('copes with thrown values that are not errors', () => {
    render(<RouteError error="plain string" retry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText(/Reference/)).toBeNull();
  });
});
