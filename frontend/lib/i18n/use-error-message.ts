import { useLocale, useMessages, useTranslations } from 'next-intl';
import { ApiError, readKeyed, type MessageKeyed } from '@/lib/api';
import type { components } from '@/lib/api-schema';

type MessageKey = components['schemas']['MessageKey'];
type ErrorCode = components['schemas']['ErrorCode'] | 'NETWORK_ERROR';

/** Every code the client can meet; a record so a code added to the contract must be listed. */
const KNOWN_CODES: Record<ErrorCode, true> = {
  AUTH_REQUIRED: true,
  FORBIDDEN: true,
  VALIDATION_ERROR: true,
  NOT_FOUND: true,
  DUPLICATE_RESOURCE: true,
  INVALID_STATUS_TRANSITION: true,
  RATE_LIMITED: true,
  UPLOAD_FAILED: true,
  SERVICE_UNAVAILABLE: true,
  INTERNAL_ERROR: true,
  NETWORK_ERROR: true,
};

function knownCode(code: string): ErrorCode {
  return Object.keys(KNOWN_CODES).find((c): c is ErrorCode => c === code) ?? 'INTERNAL_ERROR';
}

/** True when the catalog subtree has a message at the dotted `key`. */
function hasMessage(tree: unknown, key: string): key is MessageKey {
  let node = tree;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = Object.getOwnPropertyDescriptor(node, part)?.value;
  }
  return typeof node === 'string';
}

interface Worded extends MessageKeyed {
  message: string;
}

/** The first validation issue that names its message's key: the field problem to show. */
function firstKeyedIssue(details: unknown): Worded | undefined {
  if (!Array.isArray(details)) return undefined;
  for (const issue of details) {
    if (typeof issue !== 'object' || issue === null) continue;
    const message: unknown = Object.getOwnPropertyDescriptor(issue, 'message')?.value;
    const keyed = readKeyed(issue);
    if (typeof message === 'string' && keyed.messageKey) return { message, ...keyed };
  }
  return undefined;
}

/**
 * Words a failed call for the reader (F5). English shows what the server
 * wrote; Bangla words it from the key the server sent beside it, or from the
 * error code when there is none, so Bangla readers never see server English.
 * A validation failure names its first field problem. Anything that is not an
 * API error gets `fallback`, which callers pass already translated.
 */
export function useErrorMessage(): (error: unknown, fallback: string) => string {
  const locale = useLocale();
  const t = useTranslations('errors');
  const server = useMessages().errors.server;
  return (error, fallback) => {
    if (!(error instanceof ApiError)) return fallback;
    const worded: Worded = firstKeyedIssue(error.details) ?? error;
    if (locale === 'en') return worded.message;
    const key = worded.messageKey;
    if (key !== undefined && hasMessage(server, key)) {
      return t(`server.${key}`, worded.messageParams);
    }
    return t(`codes.${knownCode(error.code)}`);
  };
}
