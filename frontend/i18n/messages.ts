import en from '../messages/en.json';
import bn from '../messages/bn.json';
import type { Locale } from './locale';

/**
 * Both catalogs, typed against the English one: a key missing from the Bangla
 * file fails the typecheck (messages/messages.test.ts checks the rest).
 */
const CATALOGS = { en, bn } satisfies Record<Locale, typeof en>;

export type Messages = typeof en;

export function messagesFor(locale: Locale): Messages {
  return CATALOGS[locale];
}
