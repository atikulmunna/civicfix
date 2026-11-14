import { useLocale } from 'next-intl';

/**
 * A category's or department's name for the reader (F5): its Bangla name in
 * Bangla when an admin has given one, otherwise its English name.
 */
export function useLocalName(): (item: { name: string; nameBn?: string | null }) => string {
  const locale = useLocale();
  return (item) => (locale === 'bn' && item.nameBn ? item.nameBn : item.name);
}
