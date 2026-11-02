/**
 * Typed API client for the CivicFix backend. Always sends cookies
 * (credentials: 'include') so the httpOnly access/refresh cookies flow with
 * each request. Unwraps the §22.1 envelope and throws ApiError on failure.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000/api/v1';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  code?: string;
  details?: unknown;
}

/** Per-call options. `signal` lets callers (e.g. TanStack Query) cancel stale requests. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** Auth endpoints establish or end the session themselves, so they never trigger a refresh. */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchange the refresh cookie for a new access cookie. Single-flight: callers
 * that hit an expired session at the same time share one request, because the
 * API rotates (and so invalidates) the refresh token on every use.
 */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((res) => res.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * Send a request; if the access token has expired (AUTH_REQUIRED), refresh the
 * session once and retry. The access cookie lives 15 minutes while the refresh
 * cookie lives days, so without this users were silently signed out.
 */
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await send<T>(path, options);
  } catch (err) {
    const canRefresh =
      err instanceof ApiError &&
      err.code === 'AUTH_REQUIRED' &&
      !options.signal?.aborted &&
      !NO_REFRESH_PATHS.some((p) => path.startsWith(p));
    if (!canRefresh || !(await refreshSession())) throw err;
    return send<T>(path, options);
  }
}

async function send<T>(path: string, options: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options });
  } catch (err) {
    // A cancelled request is not a network failure: rethrow the abort as-is so
    // the caller (or TanStack Query) can recognise and ignore it.
    if (options.signal?.aborted) throw err;
    throw new ApiError('Network error. Is the API running?', 'NETWORK_ERROR', 0);
  }

  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON response */
  }

  if (!res.ok || !body?.success) {
    throw new ApiError(
      body?.message ?? `Request failed (${res.status})`,
      body?.code ?? 'INTERNAL_ERROR',
      res.status,
      body?.details,
    );
  }
  return body.data as T;
}

/** User-facing message for a failed call: the API's message, or `fallback`. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function toQuery(params?: Record<string, unknown>): string {
  if (!params) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>, opts: RequestOptions = {}) =>
    request<T>(`${path}${toQuery(params)}`, { method: 'GET', signal: opts.signal }),

  post: <T>(path: string, data?: unknown, opts: RequestOptions = {}) =>
    request<T>(path, {
      method: 'POST',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
      signal: opts.signal,
    }),

  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),

  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Multipart POST (e.g. report creation with images). No JSON content-type. */
  postForm: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
};

/** Absolute URL for a backend-served upload path like /uploads/abc.png. */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const origin = API_URL.replace(/\/api\/v1$/, '');
  return `${origin}${path}`;
}
