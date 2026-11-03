import { createServer, connect, type AddressInfo, type Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { env } from '../config/env.js';
import { createPrismaClient, withVerifiedTls } from './prisma-client.js';

const neon = 'postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb';

describe('withVerifiedTls', () => {
  it.each(['require', 'prefer', 'verify-ca'])('upgrades sslmode=%s to verify-full', (mode) => {
    const out = new URL(withVerifiedTls(`${neon}?sslmode=${mode}&channel_binding=require`));
    expect(out.searchParams.get('sslmode')).toBe('verify-full');
    expect(out.searchParams.get('channel_binding')).toBe('require');
    expect(out.host).toBe('ep-x-pooler.ap-southeast-1.aws.neon.tech');
    expect(out.username).toBe('u');
  });

  it('leaves URLs without sslmode, or with a deliberate mode, untouched', () => {
    const local = 'postgresql://civicfix:civicfix@localhost:5434/civicfix';
    expect(withVerifiedTls(local)).toBe(local);
    expect(withVerifiedTls(`${neon}?sslmode=verify-full`)).toBe(`${neon}?sslmode=verify-full`);
    expect(withVerifiedTls(`${neon}?sslmode=disable`)).toBe(`${neon}?sslmode=disable`);
  });

  it('keeps percent-encoded credentials intact', () => {
    const url = 'postgresql://user:p%40ss%2Fword@host/db?sslmode=require';
    const out = new URL(withVerifiedTls(url));
    expect(decodeURIComponent(out.password)).toBe('p@ss/word');
  });

  it('passes through strings that are not URLs', () => {
    expect(withVerifiedTls('host=localhost dbname=x')).toBe('host=localhost dbname=x');
  });
});

/**
 * A TCP proxy to the test database that holds every new connection for
 * `delayMs` before connecting it, like a Neon compute waking from
 * scale-to-zero.
 */
async function slowProxy(target: URL, delayMs: number) {
  const sockets = new Set<Socket>();
  const server = createServer((client) => {
    sockets.add(client);
    client.pause();
    setTimeout(() => {
      const upstream = connect(Number(target.port || 5432), target.hostname, () => {
        client.pipe(upstream).pipe(client);
        client.resume();
      });
      sockets.add(upstream);
      upstream.on('error', () => client.destroy());
      client.on('error', () => upstream.destroy());
    }, delayMs);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = new URL(target);
  url.hostname = '127.0.0.1';
  url.port = String(port);
  return {
    url: url.toString(),
    close: () => {
      for (const s of sockets) s.destroy();
      return new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        }),
      );
    },
  };
}

describe('createPrismaClient on a slow-to-connect database', () => {
  // Production 2026-11-03: the first list request after an idle night failed
  // with P2028 "Unable to start a transaction in the given time" after 2 s,
  // Prisma's default transaction maxWait, while Neon was still waking up.
  it('still starts transactions when opening a connection takes seconds', async () => {
    const proxy = await slowProxy(new URL(env.DATABASE_URL), 3000);
    const client = createPrismaClient(proxy.url);
    try {
      const [total, rows] = await client.$transaction([
        client.category.count(),
        client.category.findMany({ take: 1 }),
      ]);
      expect(total).toBeGreaterThanOrEqual(rows.length);
    } finally {
      await client.$disconnect();
      await proxy.close();
    }
  }, 20_000);
});
