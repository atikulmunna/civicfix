/**
 * Vitest setup: fails a test when a response it triggered broke the API
 * contract (see src/contract/validate.ts).
 */
import { afterEach } from 'vitest';
import { takeContractViolations } from '../contract/validate.js';

afterEach(() => {
  const found = takeContractViolations();
  if (found.length === 0) return;
  const lines = found.map((v) => `  ${v.method} ${v.path} -> ${String(v.status)}: ${v.problem}`);
  throw new Error(`API contract violated:\n${lines.join('\n')}`);
});
