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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { credentials: 'include', ...options });
  } catch {
    throw new ApiError('Network error — is the API running?', 'NETWORK_ERROR', 0);
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
  get: <T>(path: string, params?: Record<string, unknown>) =>
    request<T>(`${path}${toQuery(params)}`, { method: 'GET' }),

  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'POST',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),

  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** Multipart POST (e.g. report creation with images). No JSON content-type. */
  postForm: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
};

/** Absolute URL for a backend-served upload path like /uploads/abc.png. */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const origin = API_URL.replace(/\/api\/v1$/, '');
  return `${origin}${path}`;
}
