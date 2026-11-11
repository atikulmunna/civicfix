import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { messagesFor, renderWithIntl } from '@/test-utils';
import type { Report, StatusHistoryEntry } from '@/lib/types';

vi.mock('@/lib/i18n/time-zone', () => ({ deviceTimeZone: () => 'Asia/Dhaka' }));

import { SeverityBadge, StatusBadge } from './badges';
import { MergedNotice } from './merged-notice';
import { ReportCard } from './report-card';
import { StatusTimeline } from './status-timeline';

const bn = messagesFor('bn');

const entry = (over: Partial<StatusHistoryEntry>): StatusHistoryEntry => ({
  id: 'h1',
  oldStatus: null,
  newStatus: 'SUBMITTED',
  note: null,
  changedBy: { id: 'u1', name: 'Rina', role: 'citizen' },
  createdAt: '2026-11-11T04:00:00.000Z',
  ...over,
});

describe('badges in Bangla', () => {
  it('name statuses and severities from the catalog', () => {
    renderWithIntl(
      <>
        <StatusBadge status="IN_PROGRESS" />
        <SeverityBadge severity="urgent" />
      </>,
      { locale: 'bn' },
    );
    expect(screen.getByText(bn.status.IN_PROGRESS)).toBeInTheDocument();
    expect(screen.getByText(bn.severity.urgent)).toBeInTheDocument();
  });
});

describe('StatusTimeline in Bangla', () => {
  it('translates statuses and dates but leaves notes as written', () => {
    renderWithIntl(
      <StatusTimeline
        entries={[
          entry({}),
          entry({
            id: 'h2',
            oldStatus: 'SUBMITTED',
            newStatus: 'UNDER_REVIEW',
            note: 'Crew sent on Monday.',
          }),
        ]}
      />,
      { locale: 'bn' },
    );
    expect(screen.getByText(new RegExp(bn.status.UNDER_REVIEW))).toBeInTheDocument();
    expect(screen.getByText('Crew sent on Monday.')).toBeInTheDocument();
    expect(screen.getAllByText(/১১ নভেম্বর/)).toHaveLength(2);
  });

  it('says when there is no history yet', () => {
    renderWithIntl(<StatusTimeline entries={[]} />, { locale: 'bn' });
    expect(screen.getByText(bn.report.noHistory)).toBeInTheDocument();
  });
});

describe('MergedNotice in Bangla', () => {
  it('links to the original in Bangla', () => {
    renderWithIntl(<MergedNotice originalId="o1" />, { locale: 'bn' });
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/reports/o1');
    expect(link.textContent).not.toMatch(/[A-Za-z]/);
  });
});

describe('ReportCard in Bangla', () => {
  it('shows its date and counts with Bangla digits', () => {
    const report = {
      id: 'r1',
      title: 'Blocked drain',
      description: 'Water everywhere.',
      status: 'SUBMITTED',
      severity: 'high',
      createdAt: '2026-11-11T04:00:00.000Z',
      counts: { upvotes: 12, confirms: 3, falseReports: 0 },
      priorityScore: 0,
      images: [],
    } as unknown as Report;
    renderWithIntl(<ReportCard report={report} />, { locale: 'bn' });
    expect(screen.getByText(/১১ নভেম্বর/)).toBeInTheDocument();
    expect(screen.getByTitle(bn.report.upvotes)).toHaveTextContent('১২');
  });
});
