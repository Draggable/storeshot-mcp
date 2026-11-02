// SS-020 §12.2: packs the package (in the monorepo also @draggable/storeshot-sdk, which is not on
// npm yet), checks the tarball's file list, installs the tarball(s) into a temp consumer and runs
// test-dist/bin.test.mjs against the installed bin: what `npx -y <package>` would run.
// Temp data: .pack/ (git-ignored); `--keep` keeps it.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { IN_MONOREPO, MCP_ROOT } from './inputs.mjs';

const keep = process.argv.includes('--keep');
const pkg = JSON.parse(readFileSync(path.join(MCP_ROOT, 'package.json'), 'utf8'));
const pack = path.join(MCP_ROOT, '.pack');
rmSync(pack, { recursive: true, force: true });
mkdirSync(pack, { recursive: true });
const npm = (args, cwd) =>
  execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

const packed = [JSON.parse(npm(['pack', '--json', '--pack-destination', pack], MCP_ROOT))[0]];
if (IN_MONOREPO) {
  const sdk = path.resolve(MCP_ROOT, '../sdk');
  packed.push(JSON.parse(npm(['pack', '--json', '--pack-destination', pack], sdk))[0]);
}
const mine = packed[0];
const files = mine.files.map((f) => f.path).sort();
const allowed = (f) =>
  ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE', 'NOTICE'].includes(f) ||
  /^dist\/[\w/.-]+\.js$/.test(f);
const unexpected = files.filter((f) => !allowed(f));
if (unexpected.length) throw new Error(`unexpected files in the tarball: ${unexpected.join(', ')}`);
for (const must of ['dist/bin.js', 'LICENSE', 'NOTICE', 'README.md', 'package.json']) {
  if (!files.includes(must)) throw new Error(`the tarball lacks ${must}`);
}
const consumer = path.join(pack, 'consumer');
mkdirSync(consumer);
writeFileSync(
  path.join(consumer, 'package.json'),
  JSON.stringify({ name: 'consumer', private: true, type: 'module' }),
);
const tarballs = packed.map((p) => path.join(pack, p.filename));
npm(
  ['install', '--prefer-offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs],
  consumer,
);
const bin = path.join(consumer, 'node_modules', ...pkg.name.split('/'), pkg.bin['storeshot-mcp']);
const run = spawnSync(process.execPath, ['--test', path.join(MCP_ROOT, 'test-dist/bin.test.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, STORESHOT_MCP_BIN: bin },
});
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`package ok: ${mine.name}@${mine.version}, ${files.length} files, bin ${bin}`);
if (!keep) rmSync(pack, { recursive: true, force: true });
