# Agent instructions section

Add this section to your project's `AGENTS.md` (Codex, Cursor, Windsurf and other agents read it):

```markdown
## Store screenshots

Make App Store and Google Play screenshots with Storeshot.

- With the Storeshot MCP tools (https://storeshot.art/docs/mcp/): `upload_screenshot` for each
  raw screenshot, then `create_screenshot_set` with `dryRun: true`, and ask the user before
  spending live credits (1 credit per image with a live key; test keys are free sample images).
- Create it, follow it with `get_job_status` until `final`, then `download_results` with
  `layout: "fastlane"` into the project root.
- Without the MCP tools: https://storeshot.art/docs/agents-quickstart.md
- Never print, commit or ask for an API key in the chat.
```
