// Builds dist/ (tsc with tsconfig.build.json against the built @draggable/storeshot-sdk), stamps
// the package version into dist/version.js and makes the bin executable.
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { MCP_ROOT } from './inputs.mjs';

const require = createRequire(path.join(MCP_ROOT, 'package.json'));
const pkg = JSON.parse(readFileSync(path.join(MCP_ROOT, 'package.json'), 'utf8'));
let sdkEntry;
try {
  sdkEntry = require.resolve('@draggable/storeshot-sdk');
} catch {
  sdkEntry = null;
}
if (!sdkEntry || !existsSync(sdkEntry)) {
  console.error(
    '@draggable/storeshot-sdk is not built: run `npm run build -w @draggable/storeshot-sdk` first',
  );
  process.exit(1);
}
rmSync(path.join(MCP_ROOT, 'dist'), { recursive: true, force: true });
const tsc = require.resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', path.join(MCP_ROOT, 'tsconfig.build.json')], {
  stdio: 'inherit',
});
const versionFile = path.join(MCP_ROOT, 'dist/version.js');
const text = readFileSync(versionFile, 'utf8');
if (!text.includes("'0.0.0-dev'")) throw new Error('dist/version.js has no placeholder to stamp');
writeFileSync(versionFile, text.replace("'0.0.0-dev'", JSON.stringify(pkg.version)));
const bin = path.join(MCP_ROOT, 'dist/bin.js');
if (!readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node\n')) {
  throw new Error('dist/bin.js lost its shebang');
}
chmodSync(bin, 0o755);
console.log(`built ${pkg.name} ${pkg.version}`);
