// Where the MCP package finds inputs that live outside it (spec §15.1). In the public mirror
// (Draggable/storeshot-mcp) they are files of the package at the INPUTS paths. In the Storeshot
// monorepo each has one source of truth, mapped by mirror/inputs.json (monorepo only, never
// exported); the mirror export copies them with the same map. Never copy them in by hand.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MCP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Each input by name: its path in the mirror, relative to the package root. */
export const INPUTS = Object.freeze({ contract: 'contract/openapi.json' });

const MAP_FILE = path.join(MCP_ROOT, 'mirror/inputs.json');
export const IN_MONOREPO = existsSync(MAP_FILE);
const map = IN_MONOREPO ? JSON.parse(readFileSync(MAP_FILE, 'utf8')) : null;

/** A file of the monorepo (throws in the mirror). */
export function monorepoPath(rel) {
  if (!map) throw new Error(`${rel}: not inside the Storeshot monorepo`);
  return path.resolve(MCP_ROOT, map.monorepoRoot, rel);
}

/** Absolute path of an input (`contract`). */
export function inputPath(name) {
  const rel = INPUTS[name];
  if (!rel) throw new Error(`unknown MCP input ${name}`);
  if (!map) return path.join(MCP_ROOT, rel);
  const source = map.inputs[rel];
  if (!source) throw new Error(`mirror/inputs.json has no source for ${rel}`);
  return monorepoPath(source);
}
