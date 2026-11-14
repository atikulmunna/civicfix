import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import { messagesFor, renderWithIntl } from '@/test-utils';
import userEvent from '@testing-library/user-event';

const { reportClientError } = vi.hoisted(() => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/report-error', () => ({ reportClientError }));

import RouteError from '@/app/error';
import { ErrorFallback, GLOBAL_ERROR_TEXT } from './error-fallback';

describe('route error boundary', () => {
  beforeEach(() => {
    reportClientError.mockReset();
  });

  it('explains the failure, reports it once and offers a retry', async () => {
    const retry = vi.fn();
    const boom = new Error('render failed');
    renderWithIntl(<RouteError error={boom} retry={retry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(reportClientError).toHaveBeenCalledTimes(1);
    expect(reportClientError).toHaveBeenCalledWith(boom);
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows the server digest as a reference, and nothing else from the error', () => {
    const fromServer = Object.assign(new Error('secret internal detail'), { digest: '2817443' });
    renderWithIntl(<RouteError error={fromServer} retry={vi.fn()} />);

    expect(screen.getByText('2817443')).toBeInTheDocument();
    expect(screen.queryByText(/secret internal detail/)).toBeNull();
  });

  it('copes with thrown values that are not errors', () => {
    renderWithIntl(<RouteError error="plain string" retry={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText(/Reference/)).toBeNull();
  });
});

describe('route error boundary in Bangla', () => {
  it('explains the failure and offers the way out in Bangla', () => {
    const bn = createTranslator({
      locale: 'bn',
      messages: messagesFor('bn'),
      namespace: 'errors.page',
    });
    const fromServer = Object.assign(new Error('internal'), { digest: '2817443' });
    renderWithIntl(<RouteError error={fromServer} retry={vi.fn()} />, { locale: 'bn' });

    expect(screen.getByRole('heading', { name: bn('title') })).toBeInTheDocument();
    expect(screen.getByText(bn('body'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: bn('retry') })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: bn('home') })).toHaveAttribute('href', '/');
    expect(screen.getByText(new RegExp(bn('reference')))).toHaveTextContent('2817443');
  });
});

describe('root error boundary', () => {
  it("uses the catalogs' own words, English first", () => {
    expect(GLOBAL_ERROR_TEXT.map((text) => text.lang)).toEqual(['en', 'bn']);
    for (const { lang, ...words } of GLOBAL_ERROR_TEXT) {
      expect(words).toEqual(messagesFor(lang).errors.page);
    }
  });

  it('speaks both languages without a translation provider', async () => {
    const retry = vi.fn();
    const [en, bn] = GLOBAL_ERROR_TEXT;
    render(
      <ErrorFallback error={new Error('layout failed')} retry={retry} texts={GLOBAL_ERROR_TEXT} />,
    );

    expect(screen.getByRole('heading', { name: en?.title })).toBeInTheDocument();
    expect(screen.getByText(bn?.body ?? '').closest('[lang]')).toHaveAttribute('lang', 'bn');
    const button = screen.getByRole('button', { name: `${en?.retry ?? ''} / ${bn?.retry ?? ''}` });
    await userEvent.setup().click(button);
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
