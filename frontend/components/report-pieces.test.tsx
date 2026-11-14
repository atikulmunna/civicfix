import { describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
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
  noteKey: null,
  noteParams: null,
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

describe('StatusTimeline notes (F5)', () => {
  const reopen = entry({
    id: 'h9',
    oldStatus: 'RESOLVED',
    newStatus: 'IN_PROGRESS',
    note: 'Reopened: 2 residents disputed the fix with photos.',
    noteKey: 'report.reopenedByDisputes',
    noteParams: { count: 2 },
  });
  const typed = entry({ id: 'h10', note: 'Crew sent on Monday.' });

  it('words automatic notes in Bangla and shows typed notes as written', () => {
    renderWithIntl(<StatusTimeline entries={[reopen, typed]} />, { locale: 'bn' });
    const bnHistory = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'history.notes',
    });
    expect(
      screen.getByText(bnHistory('report.reopenedByDisputes', { count: 2 })),
    ).toHaveTextContent('২');
    expect(screen.queryByText(/Reopened:/)).toBeNull();
    expect(screen.getByText('Crew sent on Monday.')).toBeInTheDocument();
  });

  it('shows what the server wrote, in English', () => {
    renderWithIntl(<StatusTimeline entries={[reopen]} />);
    expect(
      screen.getByText('Reopened: 2 residents disputed the fix with photos.'),
    ).toBeInTheDocument();
  });
});

describe('ReportCard category name (F5)', () => {
  it('shows the Bangla category name in Bangla', () => {
    const report = {
      id: 'r2',
      title: 'Dark lane',
      description: 'No light at night.',
      status: 'SUBMITTED',
      severity: 'low',
      createdAt: '2026-11-11T04:00:00.000Z',
      counts: { upvotes: 0, confirms: 0, falseReports: 0 },
      priorityScore: 0,
      images: [],
      category: { id: 'c1', name: 'Street Lighting', nameBn: 'রাস্তার বাতি', icon: null },
    } as unknown as Report;
    renderWithIntl(<ReportCard report={report} />, { locale: 'bn' });
    expect(screen.getByText('রাস্তার বাতি')).toBeInTheDocument();
    expect(screen.queryByText('Street Lighting')).toBeNull();
  });
});

describe('StatusTimeline before the API sends note keys (F5)', () => {
  it('shows notes as stored, never a catalog path, when the fields are absent', () => {
    // The web deploys before the API: for a while entries arrive without noteKey.
    const legacy: Partial<StatusHistoryEntry> = entry({ id: 'h20', note: 'Report submitted.' });
    delete legacy.noteKey;
    delete legacy.noteParams;
    const silent: Partial<StatusHistoryEntry> = entry({ id: 'h21', note: null });
    delete silent.noteKey;
    delete silent.noteParams;
    renderWithIntl(
      // The old API's shape: the cast stands in for an older contract.
      <StatusTimeline entries={[legacy, silent] as StatusHistoryEntry[]} />,
      { locale: 'bn' },
    );
    expect(screen.getByText('Report submitted.')).toBeInTheDocument();
    expect(screen.queryByText(/history\.notes/)).toBeNull();
  });
});
