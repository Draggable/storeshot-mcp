// Helpers of the built-bin tests (plain ESM, Node 18 compatible).
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** check-package.mjs points this at the copy installed from the packed tarball. */
export const BIN = process.env.STORESHOT_MCP_BIN ?? path.join(MCP_ROOT, 'dist/bin.js');
if (!existsSync(BIN)) throw new Error(`${BIN} does not exist: run \`npm run build\` first`);
export const SNAPSHOT = JSON.parse(
  readFileSync(path.join(MCP_ROOT, 'test/__snapshots__/tools.json'), 'utf8'),
);
export const PKG = JSON.parse(readFileSync(path.join(MCP_ROOT, 'package.json'), 'utf8'));
export const DEVICE_CODE = 'D'.repeat(43);

export function tmp(prefix) {
  const root = path.join(MCP_ROOT, '.tmp');
  mkdirSync(root, { recursive: true });
  return mkdtempSync(path.join(root, `${prefix}-`));
}

/** A fake API: /v1/auth/device answers a code, /v1/auth/device/token keeps answering pending. */
export function fakeApi() {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ url: req.url, body });
      const json = (status, value) =>
        res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
      if (req.url === '/v1/auth/device') {
        json(200, {
          device_code: DEVICE_CODE,
          user_code: 'BCDF-GHJK',
          verification_uri: 'https://console.storeshot.art/device',
          verification_uri_complete: 'https://console.storeshot.art/device?code=BCDF-GHJK',
          expires_in: 600,
          interval: 5,
        });
      } else if (req.url === '/v1/auth/device/token') {
        json(400, { error: 'authorization_pending', error_description: 'pending' });
      } else {
        json(404, { error: { code: 'NOT_FOUND', message: 'no', requestId: 'r', docUrl: 'x' } });
      }
    });
  });
  return new Promise((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({
        url: `http://127.0.0.1:${server.address().port}`,
        requests,
        close: () => new Promise((done) => server.close(done)),
      }),
    ),
  );
}

/** Raw JSON-RPC over the bin's stdio; collects every stdout line and all of stderr. */
export function rawSession(env) {
  const child = spawn(process.execPath, [BIN], {
    env: { PATH: process.env.PATH, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  let buffer = '';
  const waiters = new Map();
  child.stdout.on('data', (d) => {
    out += d;
    buffer += d;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      try {
        const msg = JSON.parse(line);
        waiters.get(msg.id)?.(msg);
      } catch {
        // asserted by the caller on the full stdout
      }
    }
  });
  child.stderr.on('data', (d) => (err += d));
  let id = 0;
  return {
    request(method, params) {
      id += 1;
      const mine = id;
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mine, method, params })}\n`);
      return new Promise((ok) => waiters.set(mine, ok));
    },
    notify(method, params) {
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    },
    async end() {
      const closed = new Promise((ok) => child.on('close', ok));
      child.stdin.end();
      await closed;
      return { stdout: out, stderr: err, code: child.exitCode };
    },
  };
}
