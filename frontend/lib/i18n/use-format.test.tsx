import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { messagesFor, renderWithIntl } from '@/test-utils';
import type { Locale } from '@/i18n/locale';

const { deviceTimeZone } = vi.hoisted(() => ({ deviceTimeZone: vi.fn<() => string>() }));
vi.mock('./time-zone', () => ({ deviceTimeZone }));

import { useFormat, type Format } from './use-format';

function Probe({ run }: { run: (format: Format) => string }) {
  return <output>{run(useFormat())}</output>;
}

/** What `run` gives in the given language. */
function show(run: (format: Format) => string, locale: Locale = 'en'): string {
  const { unmount } = renderWithIntl(<Probe run={run} />, { locale });
  const text = screen.getByRole('status').textContent ?? '';
  unmount();
  return text;
}

describe('useFormat', () => {
  beforeEach(() => {
    deviceTimeZone.mockReturnValue('Asia/Dhaka');
  });

  it('keeps the English wording the app uses today', () => {
    expect(show((f) => f.duration(0.5))).toBe('under 1 hour');
    expect(show((f) => f.duration(1))).toBe('1 hour');
    expect(show((f) => f.duration(5))).toBe('5 hours');
    expect(show((f) => f.duration(72))).toBe('3 days');
    expect(show((f) => f.rate(0.5833))).toBe('58%');
    expect(show((f) => f.status('UNDER_REVIEW'))).toBe('Under Review');
    expect(show((f) => f.severity('urgent'))).toBe('Urgent');
    expect(show((f) => f.date('2026-11-11T10:00:00.000Z'))).toBe('Nov 11, 2026');
    expect(show((f) => f.number(1234))).toBe('1,234');
  });

  it('writes Bangla with Bangla digits', () => {
    const hours = show((f) => f.duration(5), 'bn');
    expect(hours).toContain('৫');
    expect(hours).not.toMatch(/[0-9]/);
    expect(show((f) => f.rate(0.5833), 'bn')).toContain('৫৮');
    const day = show((f) => f.date('2026-11-11T10:00:00.000Z'), 'bn');
    for (const part of ['১১', 'নভেম্বর', '২০২৬']) expect(day).toContain(part);
    expect(show((f) => f.status('RESOLVED'), 'bn')).toBe(messagesFor('bn').status.RESOLVED);
  });

  it("shows the date on the device's own clock", () => {
    expect(show((f) => f.date('2026-11-10T19:30:00.000Z'))).toBe('Nov 11, 2026');
    deviceTimeZone.mockReturnValue('America/New_York');
    expect(show((f) => f.date('2026-11-10T19:30:00.000Z'))).toBe('Nov 10, 2026');
  });

  it('adds the time of day for date and time', () => {
    deviceTimeZone.mockReturnValue('UTC');
    expect(show((f) => f.dateTime('2026-11-11T09:05:00.000Z'))).toBe('Nov 11, 2026, 09:05 AM');
  });
});
