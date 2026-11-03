# Schemas used by the listing tests

Read on 2026-11-02 (GET only). The tests check every vendored file's sha256 against this table:
refresh a schema on purpose (download it, update its row, run the tests), never by editing it.

| File | Source | Status | Licence | sha256 |
| ---- | ------ | ------ | ------- | ------ |
| `server.schema.json` | https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json (MCP Registry v1.8.7; generated from the registry's `openapi.yaml`) | official | The file states none; github.com/modelcontextprotocol/registry is Apache-2.0 (new contributions), MIT (older ones), CC-BY-4.0 (docs) | `3fba09590c99f61735d234822279f4223fab9e300c0a81e81c91ab62a4114de0` |
| `schemastore-claude-code-plugin-manifest.json` | https://json.schemastore.org/claude-code-plugin-manifest.json | community, advisory (open-world, behind the docs) | SchemaStore repository Apache-2.0 | `b86168a7ad264150c713476e2693fa2399ad90e4f7ec29ee038644c2c950e799` |
| `schemastore-claude-code-marketplace.json` | https://json.schemastore.org/claude-code-marketplace.json | community, advisory (open-world, behind the docs) | SchemaStore repository Apache-2.0 | `42c3f80413638e93a420256d942f409104b651379b9ac2451cc636f581de2ffc` |
| `claude-plugin.schema.json` | Written for Storeshot from https://code.claude.com/docs/en/plugins-reference.md | no official schema exists | Apache-2.0 (this package) | not pinned |
| `claude-marketplace.schema.json` | Written for Storeshot from https://code.claude.com/docs/en/plugins/marketplace-reference.md | no official schema exists | Apache-2.0 (this package) | not pinned |
| `mcp-config.schema.json` | Written for Storeshot from https://code.claude.com/docs/en/plugins-reference.md and https://cursor.com/docs/mcp.md | no official schema exists | Apache-2.0 (this package) | not pinned |
| `skill-frontmatter.schema.json` | Written for Storeshot from https://agentskills.io/specification and https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview.md | no official schema exists | Apache-2.0 (this package) | not pinned |
| `cursor-rule.schema.json` | Written for Storeshot from https://cursor.com/docs/rules.md | no official schema exists | Apache-2.0 (this package) | not pinned |
