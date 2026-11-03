import { describe, expect, test } from 'vitest';
import { readFrontmatter } from './frontmatter.js';

describe('readFrontmatter (SS-024 spec §8.3: one-line YAML subset)', () => {
  test('reads one-line strings, booleans and a one-level metadata map', () => {
    const { data, body } = readFrontmatter(
      '---\nname: storeshot\ndescription: Makes images - fast, for both stores.\nalwaysApply: false\nmetadata:\n  owner: storeshot\n---\n\n# Body\n',
      'x.md',
    );
    expect(data).toEqual({
      name: 'storeshot',
      description: 'Makes images - fast, for both stores.',
      alwaysApply: false,
      metadata: { owner: 'storeshot' },
    });
    expect(body).toBe('\n# Body\n');
  });

  test.each([
    ['no frontmatter on line 1', '\n---\nname: a\n---\n'],
    ['unterminated', '---\nname: a\n'],
    ['folded value', '---\ndescription: >\n  long\n---\n'],
    ['continuation line', '---\ndescription: one\n  two\n---\n'],
    ['quoted value', '---\nname: "a"\n---\n'],
    ['colon-space inside', '---\ndescription: a: b\n---\n'],
    ['comment', '---\nname: a # c\n---\n'],
    ['number-like', '---\nname: 1.0\n---\n'],
    ['yes/no', '---\nname: yes\n---\n'],
    ['leading indicator', '---\nname: -a\n---\n'],
    ['duplicate key', '---\nname: a\nname: b\n---\n'],
    ['nested map other than metadata', '---\nother:\n  a: b\n---\n'],
    ['boolean in metadata', '---\nmetadata:\n  a: true\n---\n'],
    ['trailing space', '---\nname: a \n---\n'],
    ['list item', '---\nglobs:\n  - a\n---\n'],
  ])('rejects %s', (_label, text) => {
    expect(() => readFrontmatter(text, 'x.md')).toThrow(/x\.md/);
  });
});
