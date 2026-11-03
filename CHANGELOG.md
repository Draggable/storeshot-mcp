# Changelog

## 2.53.0 — first published version (contract 1.17.0), 2026-11-02

Published to npm with provenance from the public repository `Draggable/storeshot-mcp`.

- stdio MCP server with nine tools: store requirements, output sizes, uploads from a local path,
  single generations, screenshot sets (with free quotes), job status with waits and progress,
  downloads to a local folder (store or fastlane layout), credits and account-link status.
- Account linking without a key (device authorization): the key is stored with mode 0600, per API
  base URL and key environment.
- Test keys never spend credits; live keys spend 1 credit per image.
