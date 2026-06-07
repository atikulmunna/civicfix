/**
 * Minimal text sanitization (SEC-007, COM-006). Escapes HTML-significant
 * characters so user-generated text can never inject markup when rendered.
 * Applied on write for stored user content (e.g. comments).
 */
export function sanitizeText(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
