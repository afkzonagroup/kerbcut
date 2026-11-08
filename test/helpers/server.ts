// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only
//
// A local HTTP server for tests. It listens on 127.0.0.1 only, on a random
// port, and records every request it receives.
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A recorded request. */
export interface Seen {
  readonly method: string;
  readonly url: string;
  readonly headers: IncomingHttpHeaders;
}

/** A route handler. */
export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

/** A running test server. */
export interface TestServer {
  readonly port: number;
  readonly origin: string;
  readonly seen: Seen[];
  /** WebSocket upgrade attempts received. */
  upgrades: number;
  close(): Promise<void>;
}

/** HTML response helper. */
export function html(body: string, status = 200, headers: Record<string, string> = {}): Handler {
  return (_req, res) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(body);
  };
}

/** Redirect helper. */
export function redirect(location: string, status = 302): Handler {
  return (_req, res) => {
    res.writeHead(status, { location });
    res.end();
  };
}

/** Starts a server with exact-path routes ("GET /path" or "/path"). Unknown paths get 404. */
export async function startServer(routes: Record<string, Handler>): Promise<TestServer> {
  const seen: Seen[] = [];
  const state = { upgrades: 0 };
  const server: Server = createServer((req, res) => {
    seen.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
    const key = `${req.method ?? 'GET'} ${req.url ?? '/'}`;
    // Own properties only: a request path such as "/constructor" must not reach Object.prototype.
    const pick = (k: string): Handler | undefined => (Object.hasOwn(routes, k) ? routes[k] : undefined);
    const handler = pick(key) ?? pick(req.url ?? '/');
    if (handler) {
      handler(req, res);
      return;
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  });
  server.on('upgrade', (_req, socket) => {
    state.upgrades++;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const ts: TestServer = {
    port,
    origin: `http://127.0.0.1:${port}`,
    seen,
    get upgrades() {
      return state.upgrades;
    },
    set upgrades(v: number) {
      state.upgrades = v;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
  return ts;
}
