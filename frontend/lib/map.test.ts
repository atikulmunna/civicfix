import { describe, expect, it } from 'vitest';
import { bboxString, statusColor } from './map';

describe('map helpers', () => {
  it('formats bbox as minLng,minLat,maxLng,maxLat', () => {
    expect(bboxString({ west: 90.1, south: 23.7, east: 90.5, north: 23.9 })).toBe('90.1,23.7,90.5,23.9');
  });

  it('colours resolved green and submitted slate', () => {
    expect(statusColor('RESOLVED')).toBe('#16a34a');
    expect(statusColor('SUBMITTED')).toBe('#64748b');
    expect(statusColor('REJECTED')).toBe('#94a3b8');
  });
});
