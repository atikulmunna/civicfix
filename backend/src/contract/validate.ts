/**
 * Contract enforcement in tests (R10). In the test build every JSON response
 * is checked against src/contract/routes.ts: success bodies against the
 * route's envelope, errors against the error envelope. Violations are
 * collected and src/test/contract-setup.ts fails the test that caused them,
 * so the whole integration suite doubles as a contract test.
 */
import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { routes, type ContractRoute } from './routes.js';
import { ErrorEnvelopeSchema, successEnvelope } from './schemas.js';

export interface ContractViolation {
  method: string;
  path: string;
  status: number;
  problem: string;
}

const violations: ContractViolation[] = [];

/** Returns and clears the violations recorded so far. */
export function takeContractViolations(): ContractViolation[] {
  return violations.splice(0);
}

/** Express path to OpenAPI path: `/reports/:id/` becomes `/reports/{id}`. */
export function toOpenApiPath(expressPath: string): string {
  const path = expressPath.replace(/:(\w+)/g, '{$1}');
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

const contracts = new Map<string, { route: ContractRoute; envelope: z.ZodType }>(
  routes.map((route) => [
    `${route.method.toUpperCase()} ${route.path}`,
    { route, envelope: successEnvelope(route.data) },
  ]),
);

function summarize(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Checks one response. `path` is the matched route in OpenAPI form, or
 * undefined when no route matched. Returns a description of the problem, or
 * null when the response honours the contract.
 */
export function checkResponse(
  method: string,
  path: string | undefined,
  status: number,
  body: unknown,
): string | null {
  // Validate what the client receives: JSON turns Dates into ISO strings.
  const wire: unknown = body === undefined ? undefined : JSON.parse(JSON.stringify(body));

  if (status >= 400) {
    const result = ErrorEnvelopeSchema.safeParse(wire);
    return result.success ? null : `error envelope: ${summarize(result.error)}`;
  }
  if (path === undefined) return 'success response outside any route';

  const contract = contracts.get(`${method} ${path}`);
  if (!contract)
    return `no contract entry for ${method} ${path} (add it to src/contract/routes.ts)`;

  const expected = contract.route.status ?? 200;
  if (status !== expected) return `status ${String(status)}, contract says ${String(expected)}`;

  const result = contract.envelope.safeParse(wire);
  return result.success ? null : summarize(result.error);
}

/** Middleware (test build only) that checks every res.json() call. */
export function enforceContract(): RequestHandler {
  return (req, res, next) => {
    const send = res.json.bind(res);
    res.json = (body: unknown) => {
      const route = req.route as { path?: unknown } | undefined;
      const path =
        typeof route?.path === 'string' ? toOpenApiPath(`${req.baseUrl}${route.path}`) : undefined;
      const problem = checkResponse(req.method, path, res.statusCode, body);
      if (problem) {
        violations.push({
          method: req.method,
          path: path ?? req.originalUrl,
          status: res.statusCode,
          problem,
        });
      }
      return send(body);
    };
    next();
  };
}
