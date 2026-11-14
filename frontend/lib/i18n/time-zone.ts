/**
 * The device's own time zone, so times read as they do on the clock in front
 * of the person (F5). Its own module so tests can stand in for any device.
 */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
