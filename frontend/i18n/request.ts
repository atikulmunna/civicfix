/**
 * next-intl's request configuration (F5): the language for this request, its
 * messages, and a time zone for anything formatted on the server.
 */
import { cookies, headers } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { LOCALE_COOKIE, resolveLocale, SERVER_TIME_ZONE } from './locale';
import { messagesFor } from './messages';

export default getRequestConfig(async () => {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerList.get('accept-language'),
  );
  return { locale, messages: messagesFor(locale), timeZone: SERVER_TIME_ZONE };
});
