/**
 * Builds the OpenAPI 3.1 document from the API contract (src/contract) and
 * writes it to backend/openapi.json, which the frontend generates its types
 * from (R10).
 *
 *   npm run openapi          regenerate openapi.json
 *   npm run openapi:check    fail if openapi.json is out of date (CI)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import {
  createDocument,
  type ZodOpenApiOperationObject,
  type ZodOpenApiPathsObject,
} from 'zod-openapi';
import { routes, type ContractRoute } from '../src/contract/routes.js';
import { ErrorEnvelopeSchema, successEnvelope } from '../src/contract/schemas.js';

const OUTPUT = fileURLToPath(new URL('../openapi.json', import.meta.url));

const signedIn: Record<string, string[]>[] = [{ cookieAuth: [] }, { bearerAuth: [] }];

/** Multipart file fields (validated by magic bytes). */
const FILE_FIELDS = {
  images: z
    .array(z.string().meta({ format: 'binary' }))
    .min(1)
    .max(5)
    .meta({ description: '1 to 5 photos (PNG, JPEG or WebP), at most 5 MB each.' }),
  photo: z.string().meta({
    format: 'binary',
    description: 'One photo (PNG, JPEG or WebP), at most 5 MB.',
  }),
};

function accessNote(route: ContractRoute): string {
  if (route.access === 'public') return 'No authentication.';
  if (route.access === 'optional') return 'Authentication optional; staff see more.';
  if (route.access === 'user') return 'Requires a signed-in user.';
  return `Requires role: ${route.access.join(', ')}.`;
}

function operation(route: ContractRoute): ZodOpenApiOperationObject {
  const op: ZodOpenApiOperationObject = {
    summary: route.summary,
    description: accessNote(route),
    tags: [route.tag],
    security:
      route.access === 'public' ? [] : route.access === 'optional' ? [{}, ...signedIn] : signedIn,
    responses: {
      [String(route.status ?? 200)]: {
        description: 'Success',
        content: { 'application/json': { schema: successEnvelope(route.data) } },
      },
      default: {
        description: 'Error (see ErrorCode)',
        content: { 'application/json': { schema: ErrorEnvelopeSchema } },
      },
    },
  };
  if (route.params || route.query) {
    op.requestParams = {
      ...(route.params && { path: route.params }),
      ...(route.query && { query: route.query }),
    };
  }
  if (route.body) {
    op.requestBody = { required: true, content: { 'application/json': { schema: route.body } } };
  } else if (route.multipart) {
    op.requestBody = {
      required: true,
      content: {
        'multipart/form-data': {
          schema: route.multipart.fields.extend({
            [route.multipart.files]: FILE_FIELDS[route.multipart.files],
          }),
        },
      },
    };
  }
  return op;
}

export function buildDocument() {
  const paths: ZodOpenApiPathsObject = {};
  for (const route of routes) {
    paths[route.path] = { ...paths[route.path], [route.method]: operation(route) };
  }
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'CivicFix API',
      version: '1',
      description:
        'Community problem reporting. Every response uses the envelope ' +
        '{ success, data } or { success: false, message, code, details? }.',
    },
    servers: [{ url: 'https://civicfix-api.fly.dev' }],
    paths,
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  });
}

const json = `${JSON.stringify(buildDocument(), null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUTPUT, 'utf8');
  } catch {
    // Missing counts as stale.
  }
  if (current !== json) {
    console.error('openapi.json is out of date: run `npm run openapi` and commit it.');
    process.exit(1);
  }
  console.log('openapi.json is up to date.');
} else {
  writeFileSync(OUTPUT, json);
  console.log(`wrote ${OUTPUT}`);
}
