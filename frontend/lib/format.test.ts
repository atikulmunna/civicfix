import { describe, expect, it } from 'vitest';
import { asSeverity, asStatus } from './format';

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
