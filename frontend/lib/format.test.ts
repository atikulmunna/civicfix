import { describe, expect, it } from 'vitest';
import { asSeverity, asStatus, formatDuration, formatRate } from './format';

describe('formatDuration', () => {
  it('reads as hours under a day and days after that', () => {
    expect(formatDuration(0.4)).toBe('under 1 hour');
    expect(formatDuration(1)).toBe('1 hour');
    expect(formatDuration(5.2)).toBe('5 hours');
    expect(formatDuration(24)).toBe('1 day');
    expect(formatDuration(72)).toBe('3 days');
    expect(formatDuration(720)).toBe('30 days');
  });
});

describe('formatRate', () => {
  it('gives a whole percentage', () => {
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(0.5833)).toBe('58%');
    expect(formatRate(1)).toBe('100%');
  });
});

describe('asStatus and asSeverity', () => {
  it('keep real values and treat anything else as no filter', () => {
    expect(asStatus('RESOLVED')).toBe('RESOLVED');
    expect(asStatus('bogus')).toBeUndefined();
    expect(asStatus('')).toBeUndefined();
    expect(asStatus(null)).toBeUndefined();
    expect(asSeverity('urgent')).toBe('urgent');
    expect(asSeverity('bogus')).toBeUndefined();
  });
});
