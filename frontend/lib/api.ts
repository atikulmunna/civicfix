/**
 * Typed API client for the CivicFix backend. Always sends cookies
 * (credentials: 'include') so the httpOnly access/refresh cookies flow with
 * each request. Unwraps the §22.1 envelope and throws ApiError on failure.
 *
 * Calls are typed by the backend contract (R10b): the path you pass, e.g.
 * `/reports/${id}`, is matched to its route (`/reports/{id}`) in the
 * generated lib/api-schema.ts, which decides the query, body and response
 * types. An unknown path or a mismatched body does not compile.
 */
import type { paths } from './api-schema';

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

function toQuery(params: unknown): string {
  if (typeof params !== 'object' || params === null) return '';
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params) as [string, unknown][]) {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

// ---------------------------------------------------------------------------
// Contract typing. Routes come from lib/api-schema.ts (generated from
// backend/openapi.json); paths there carry the /api/v1 prefix, which is part
// of API_URL here.

type Method = 'get' | 'post' | 'patch' | 'delete';
type Prefix = '/api/v1';

/** Every route relative to API_URL, e.g. '/reports/{id}'. */
type Route = keyof paths extends infer K ? (K extends `${Prefix}${infer R}` ? R : never) : never;

/** The operation for `method` on `route` (never if the route lacks it). */
type Operation<R extends Route, M extends Method> = M extends keyof paths[`${Prefix}${R}`]
  ? Exclude<paths[`${Prefix}${R}`][M], undefined>
  : never;

type RoutesFor<M extends Method> = {
  [R in Route]: [Operation<R, M>] extends [never] ? never : R;
}[Route];

/** '/reports/{id}/comments' becomes `/reports/${string}/comments` (a coarse filter). */
type Pattern<T extends string> = T extends `${infer A}{${string}}${infer B}`
  ? `${A}${string}${Pattern<B>}`
  : T;

/** Equal both ways (a literal and a pattern are not the same). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** '/reports/r1/comments' becomes ['reports', 'r1', 'comments']. */
type Segments<S extends string> = S extends `/${infer Rest}` ? SegmentsOf<Rest> : [];
type SegmentsOf<S extends string> = S extends `${infer Head}/${infer Tail}`
  ? [Head, ...SegmentsOf<Tail>]
  : [S];

/** A `{param}` segment takes any non-empty segment; a literal one must be equal. */
type SegmentMatches<R, P> = R extends `{${string}}` ? (P extends '' ? false : true) : Same<R, P>;

type AllSegmentsMatch<R extends unknown[], P extends unknown[]> = R extends [
  infer R1,
  ...infer RRest,
]
  ? P extends [infer P1, ...infer PRest]
    ? SegmentMatches<R1, P1> extends true
      ? AllSegmentsMatch<RRest, PRest>
      : false
    : false
  : P extends []
    ? true
    : false;

type StaticRouteOf<M extends Method, P extends string> = {
  [R in RoutesFor<M>]: Same<R, P> extends true ? R : never;
}[RoutesFor<M>];

type ParamRouteOf<M extends Method, P extends string> = {
  [R in RoutesFor<M>]: AllSegmentsMatch<Segments<R>, Segments<P>> extends true ? R : never;
}[RoutesFor<M>];

/**
 * The route a concrete path belongs to, matched segment by segment like a
 * router: '/reports/r1' and `/reports/${id}` are '/reports/{id}', and a static
 * route wins ('/reports/nearby' is not '/reports/{id}'). Distributes over
 * unions, so a path that is one of several routes gets all their types.
 */
type RouteOf<M extends Method, P extends string> = P extends string
  ? [StaticRouteOf<M, P>] extends [never]
    ? ParamRouteOf<M, P>
    : StaticRouteOf<M, P>
  : never;

type OperationFor<M extends Method, P extends string> = Operation<RouteOf<M, P>, M>;

type SuccessOf<O> = O extends { responses: infer Res }
  ? 200 extends keyof Res
    ? Res[200]
    : 201 extends keyof Res
      ? Res[201]
      : never
  : never;

/** A path the API accepts for `method`, as written at the call site. */
export type ApiPath<M extends Method> = Pattern<RoutesFor<M>>;

/**
 * `T` for a path that is a route of the API, never otherwise. Without this
 * guard a path with no route would match the conditional types below as
 * `unknown`, which accepts any body and hides the response type.
 */
type IfRoute<M extends Method, P extends string, T> = [RouteOf<M, P>] extends [never] ? never : T;

// The extractors take the operation as a naked type parameter, so they
// distribute: a path that is one of several routes gets the union of their
// types (an `infer` over a union would pick one candidate instead).
type DataOf<O> =
  SuccessOf<O> extends { content: { 'application/json': { data: infer D } } } ? D : never;
type QueryOf<O> = O extends { parameters: { query?: infer Q } } ? Q : never;
type BodyOf<O> = O extends { requestBody?: { content: { 'application/json': infer B } } }
  ? B
  : never;

/** The `data` a call returns (the envelope is unwrapped). */
export type ApiData<M extends Method, P extends string> = IfRoute<M, P, DataOf<OperationFor<M, P>>>;

type ApiQuery<P extends string> = IfRoute<'get', P, QueryOf<OperationFor<'get', P>>>;

type ApiBody<M extends Method, P extends string> = IfRoute<M, P, BodyOf<OperationFor<M, P>>>;

export const api = {
  get: <P extends ApiPath<'get'>>(path: P, params?: ApiQuery<P>, opts: RequestOptions = {}) =>
    request<ApiData<'get', P>>(`${path}${toQuery(params)}`, {
      method: 'GET',
      signal: opts.signal,
    }),

  post: <P extends ApiPath<'post'>>(
    path: P,
    data?: ApiBody<'post', P>,
    opts: RequestOptions = {},
  ) =>
    request<ApiData<'post', P>>(path, {
      method: 'POST',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
      signal: opts.signal,
    }),

  patch: <P extends ApiPath<'patch'>>(path: P, data?: ApiBody<'patch', P>) =>
    request<ApiData<'patch', P>>(path, {
      method: 'PATCH',
      headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: data !== undefined ? JSON.stringify(data) : undefined,
    }),

  del: <P extends ApiPath<'delete'>>(path: P) =>
    request<ApiData<'delete', P>>(path, { method: 'DELETE' }),

  /** Multipart POST (e.g. report creation with images). No JSON content-type. */
  postForm: <P extends ApiPath<'post'>>(path: P, form: FormData) =>
    request<ApiData<'post', P>>(path, { method: 'POST', body: form }),
};

/** Absolute URL for a backend-served upload path like /uploads/abc.png. */
export function assetUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  const origin = API_URL.replace(/\/api\/v1$/, '');
  return `${origin}${path}`;
}
