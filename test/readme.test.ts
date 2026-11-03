import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { IN_MONOREPO } from '../scripts/inputs.mjs';

const readme = readFileSync(path.resolve(__dirname, '../README.md'), 'utf8');
const blocks = [...readme.matchAll(/```(\w+)\n([\s\S]*?)```/g)].map((m) => ({
  lang: m[1],
  code: m[2],
}));
const NAME = '@draggable/storeshot-mcp';

describe('README (spec §15.2, amendments A1/A2)', () => {
  test('sections, in order', () => {
    const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'Install',
      'Agent skill, plugin and rules',
      'Linking your account',
      'Test and live keys',
      'Tools',
      'Environment variables',
      'Local files',
      'Checking with MCP Inspector',
      'Troubleshooting',
      'Licence',
      // The public mirror's README ends with how the repository is generated (mirror/export.mjs).
      ...(IN_MONOREPO ? [] : ['Source of truth']),
    ]);
    expect(readme).toMatch(/^# @draggable\/storeshot-mcp\n/);
    expect(readme).not.toMatch(/not on npm|not (yet )?published|once published/i);
    expect(readme.includes('<!-- mirror:monorepo-note -->')).toBe(IN_MONOREPO);
  });

  test('every JSON snippet parses and runs npx -y @draggable/storeshot-mcp', () => {
    const json = blocks.filter((b) => b.lang === 'json');
    expect(json).toHaveLength(3);
    for (const b of json) {
      const parsed = JSON.parse(b.code);
      const servers = (parsed.mcpServers ?? parsed.servers) as Record<
        string,
        { command: string; args: string[] }
      >;
      expect(Object.keys(servers)).toEqual(['storeshot']);
      expect(servers.storeshot.command).toBe('npx');
      expect(servers.storeshot.args).toEqual(['-y', NAME]);
    }
  });

  test('Claude Code and Codex snippets; no literal key, no default environment claimed', () => {
    expect(readme).toContain(`claude mcp add storeshot -- npx -y ${NAME}`);
    expect(readme).toContain(`codex mcp add storeshot -- npx -y ${NAME}`);
    const toml = blocks.find((b) => b.lang === 'toml')!.code;
    expect(toml).toBe(`[mcp_servers.storeshot]\ncommand = "npx"\nargs = ["-y", "${NAME}"]\n`);
    expect(readme).not.toMatch(/ss_(live|test)_[A-Za-z0-9]{20,}/);
    expect(readme).not.toMatch(/[A-Z_]*(KEY|TOKEN|SECRET)=[^\s=]/);
    expect(readme).not.toMatch(/test (mode )?by default|defaults? to test/i);
    expect(readme).not.toContain('@storeshot/mcp');
  });

  test('the agent skill section (SS-024) points at the repository files, naming no instruction file', () => {
    const section = readme.split('## Agent skill, plugin and rules')[1].split('\n## ')[0];
    expect(section).toContain('/plugin marketplace add Draggable/storeshot-mcp');
    expect(section).toContain('/plugin install storeshot@storeshot');
    for (const file of [
      'skills/storeshot',
      'rules/storeshot.mdc',
      'snippets/agents-section.md',
      'snippets/prompt.md',
    ]) {
      expect(section).toContain(`\`${file}\``);
    }
    expect(section).not.toMatch(/\b(?:CLAUDE|AGENTS)\.md\b|\.claude\//);
  });

  test('the tool table lists all nine tools', () => {
    for (const t of [
      'get_store_requirements',
      'list_devices',
      'upload_screenshot',
      'generate_screenshot',
      'create_screenshot_set',
      'get_job_status',
      'download_results',
      'get_credits',
      'link_status',
    ]) {
      expect(readme).toMatch(new RegExp(`^\\| \`${t}\` +\\|`, 'm'));
    }
  });
});
