import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { messagesFor, renderWithIntl } from '@/test-utils';
import HomePage from './page';

describe('HomePage', () => {
  it('keeps its English', () => {
    renderWithIntl(<HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Report civic issues. Track the fix.',
    );
    expect(screen.getByRole('heading', { name: 'Pin the exact spot' })).toBeInTheDocument();
  });

  it('reads in Bangla, every feature and step included', () => {
    const t = messagesFor('bn').home;
    renderWithIntl(<HomePage />, { locale: 'bn' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t.hero.titleLead);
    for (const feature of Object.values(t.features.items)) {
      expect(screen.getByRole('heading', { name: feature.title })).toBeInTheDocument();
    }
    for (const step of Object.values(t.how.steps)) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
    }
    expect(screen.getByText('০১')).toBeInTheDocument();
  });
});
