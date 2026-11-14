import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesFor, renderWithIntl } from '@/test-utils';

const { refresh, patch, useAuth, setLocale } = vi.hoisted(() => ({
  refresh: vi.fn(),
  patch: vi.fn(),
  useAuth: vi.fn(),
  setLocale: vi.fn(),
}));
vi.mock('@/i18n/actions', () => ({ setLocale }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...actual, api: { ...actual.api, patch } };
});
vi.mock('./auth-context', () => ({ useAuth }));

import { LanguageSwitch } from './language-switch';

const SIGNED_IN = { id: 'u1', name: 'Rina', role: 'citizen' };

describe('LanguageSwitch', () => {
  beforeEach(() => {
    refresh.mockReset();
    patch.mockReset().mockResolvedValue({ user: SIGNED_IN });
    useAuth.mockReturnValue({ user: null });
    setLocale.mockReset().mockResolvedValue(undefined);
  });

  it('offers Bangla in its own name, and switches the device to it', async () => {
    renderWithIntl(<LanguageSwitch />);
    const button = screen.getByRole('button', { name: messagesFor('en').nav.switchTo });
    expect(button).toHaveTextContent('বাংলা');
    expect(button.querySelector('[lang="bn"]')).not.toBeNull();

    await userEvent.setup().click(button);
    expect(setLocale).toHaveBeenCalledWith('bn');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(patch).not.toHaveBeenCalled();
  });

  it('offers English from Bangla', async () => {
    renderWithIntl(<LanguageSwitch />, { locale: 'bn' });
    const button = screen.getByRole('button', { name: messagesFor('bn').nav.switchTo });
    expect(button).toHaveTextContent('English');
    await userEvent.setup().click(button);
    expect(setLocale).toHaveBeenCalledWith('en');
  });

  it('saves the choice to the account when signed in', async () => {
    useAuth.mockReturnValue({ user: SIGNED_IN });
    renderWithIntl(<LanguageSwitch />);
    await userEvent.setup().click(screen.getByRole('button'));
    await waitFor(() => expect(patch).toHaveBeenCalledWith('/users/me', { language: 'bn' }));
  });

  it('still switches, quietly, when saving to the account fails', async () => {
    useAuth.mockReturnValue({ user: SIGNED_IN });
    patch.mockRejectedValue(new Error('offline'));
    renderWithIntl(<LanguageSwitch />);
    await userEvent.setup().click(screen.getByRole('button'));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(setLocale).toHaveBeenCalledWith('bn');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('still refreshes when remembering the language fails', async () => {
    setLocale.mockRejectedValue(new Error('offline'));
    renderWithIntl(<LanguageSwitch />);
    await userEvent.setup().click(screen.getByRole('button'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
