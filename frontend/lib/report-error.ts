/**
 * The one place the web app reports unexpected UI errors (the error
 * boundaries call it). For now it writes to the browser console; connecting
 * an error tracker (R13) means changing only this function.
 */
export function reportClientError(error: unknown): void {
  console.error('[civicfix] unhandled UI error', error);
}
