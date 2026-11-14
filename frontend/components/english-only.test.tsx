import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { useFormat } from '@/lib/i18n/use-format';
import { messagesFor, renderWithIntl } from '@/test-utils';
import { EnglishOnly } from './english-only';

function Resolved({ label }: { label: string }) {
  return <p aria-label={label}>{useFormat().status('RESOLVED')}</p>;
}

describe('EnglishOnly', () => {
  it('keeps its part of the page in English while the rest is in Bangla', () => {
    renderWithIntl(
      <>
        <Resolved label="outside" />
        <EnglishOnly>
          <Resolved label="inside" />
        </EnglishOnly>
      </>,
      { locale: 'bn' },
    );
    expect(screen.getByLabelText('outside')).toHaveTextContent(messagesFor('bn').status.RESOLVED);
    const inside = screen.getByLabelText('inside');
    expect(inside).toHaveTextContent('Resolved');
    expect(inside.closest('[lang]')).toHaveAttribute('lang', 'en');
  });
});
