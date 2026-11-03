// SS-024 §8.3: the frontmatter of SKILL.md and .mdc files is a YAML subset every parser reads the
// same way: one-line `key: value` pairs (plain strings or true/false) and a one-level `metadata:`
// map of plain strings. Anything else throws, so a reformat that folds a value fails loudly. In
// the monorepo test/monorepo/listings.monorepo.test.ts cross-checks it against the `yaml` package.
export type FrontmatterValue = string | boolean | Record<string, string>;
export interface Frontmatter {
  data: Record<string, FrontmatterValue>;
  body: string;
}

const KEY = '[a-z][a-zA-Z0-9-]*';
const NOT_PLAIN =
  /^(?:true|false|null|~|yes|no|on|off|y|n|[-+]?\.?\d[\d._]*(?:e[-+]?\d+)?|0x[0-9a-f]+|\.inf|\.nan)$/i;
// No leading indicator, quote or space; no `: ` or ` #` inside.
const PLAIN = /^[^\s'"`!&*|>%@[\]{}#,?:-](?:(?!: | #)[^\n])*$/;

function scalar(raw: string, where: string, booleans: boolean): string | boolean {
  if (booleans && (raw === 'true' || raw === 'false')) return raw === 'true';
  if (NOT_PLAIN.test(raw) || !PLAIN.test(raw) || raw.endsWith(':') || raw.endsWith(' ')) {
    throw new Error(`${where}: "${raw}" is not a one-line plain string`);
  }
  return raw;
}

function set(target: Record<string, unknown>, key: string, value: unknown, where: string) {
  if (Object.hasOwn(target, key)) throw new Error(`${where}: duplicate key "${key}"`);
  target[key] = value;
}

export function readFrontmatter(text: string, file: string): Frontmatter {
  if (!text.startsWith('---\n')) throw new Error(`${file}: frontmatter must start on line 1`);
  const end = text.indexOf('\n---\n', 3);
  if (end < 0) throw new Error(`${file}: frontmatter is not closed by ---`);
  const data: Record<string, FrontmatterValue> = {};
  let map: Record<string, string> | null = null;
  text
    .slice(4, end)
    .split('\n')
    .forEach((line, i) => {
      const where = `${file}:${i + 2}`;
      const nested = new RegExp(`^ {2}(${KEY}): (.*)$`).exec(line);
      if (nested) {
        if (!map) throw new Error(`${where}: indented line outside the metadata map`);
        set(map, nested[1], scalar(nested[2], where, false), where);
        return;
      }
      const top = new RegExp(`^(${KEY}):(?: (.*))?$`).exec(line);
      if (!top) throw new Error(`${where}: not a one-line "key: value"`);
      const [, key, raw] = top;
      if (raw === undefined) {
        if (key !== 'metadata') throw new Error(`${where}: only "metadata" may be a map`);
        map = {};
        set(data, key, map, where);
        return;
      }
      map = null;
      set(data, key, scalar(raw, where, true), where);
    });
  return { data, body: text.slice(end + 5) };
}
