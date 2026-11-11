import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '@/test-utils';
import { BarChart } from './bar-chart';

describe('BarChart', () => {
  it('renders a row per data point with its value', () => {
    renderWithIntl(
      <BarChart
        data={[
          { label: 'Submitted', value: 4 },
          { label: 'Resolved', value: 2 },
        ]}
      />,
    );
    expect(screen.getByText('Submitted')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows a fallback when empty', () => {
    renderWithIntl(<BarChart data={[]} />);
    expect(screen.getByText('No data.')).toBeInTheDocument();
  });
});
