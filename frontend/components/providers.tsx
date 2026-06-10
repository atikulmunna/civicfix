'use client';

import type { ReactNode } from 'react';
import { AuthProvider } from './auth-context';
import { ToastProvider } from './toast';

/** Client-side context providers wrapping the whole app. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <AuthProvider>{children}</AuthProvider>
    </ToastProvider>
  );
}
