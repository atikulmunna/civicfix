import type { ReactNode } from 'react';
import { EnglishOnly } from '@/components/english-only';

/** Staff pages are not translated yet (F5): keep them, and what they share, in English. */
export default function StaffLayout({ children }: { children: ReactNode }) {
  return <EnglishOnly>{children}</EnglishOnly>;
}
