# @draggable/storeshot-mcp

The Storeshot MCP server: App Store and Google Play marketing screenshots from Claude Code, Cursor,
VS Code, Windsurf, Codex and any other [MCP](https://modelcontextprotocol.io/) client. It runs on
your machine over stdio (Node ≥ 18) and gives your coding agent nine tools: read the store rules,
upload raw screenshots from your disk, create a whole screenshot set, follow it and save the images
into your project, fastlane folders included.

> **Not on npm yet.** `@draggable/storeshot-mcp` has not been published. Until it is, build it from
> this repository with `npm ci && npm run build` and use `"command": "node"` with
> `"args": ["/absolute/path/to/dist/bin.js"]` instead of `npx` in the snippets below.

## Install

Once published, every client starts the server with `npx -y @draggable/storeshot-mcp`.

Claude Code:

```sh
claude mcp add storeshot -- npx -y @draggable/storeshot-mcp
```

Cursor (`.cursor/mcp.json` in your project, or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "storeshot": { "command": "npx", "args": ["-y", "@draggable/storeshot-mcp"] }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "storeshot": { "type": "stdio", "command": "npx", "args": ["-y", "@draggable/storeshot-mcp"] }
  }
}
```

If you use an API key in VS Code, pass it through an `inputs` entry with `"password": true` and
`"env": { "STORESHOT_API_KEY": "${input:storeshot-key}" }`, so the key is never written into the
file (and never committed).

Windsurf (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "storeshot": { "command": "npx", "args": ["-y", "@draggable/storeshot-mcp"] }
  }
}
```

Codex (`~/.codex/config.toml`), or `codex mcp add storeshot -- npx -y @draggable/storeshot-mcp`:

```toml
[mcp_servers.storeshot]
command = "npx"
args = ["-y", "@draggable/storeshot-mcp"]
```

On Windows some clients need `"command": "cmd"` with `"args": ["/c", "npx", "-y",
"@draggable/storeshot-mcp"]`.

## Linking your account

You do not need to copy an API key. The first tool call that needs one answers with a link and a
code (`ACCOUNT_LINK_REQUIRED`), and the server writes the same line to its log (stderr). Open the
link, sign in to the Storeshot developer console and approve: the server receives an API key of its
own (named "Storeshot MCP" unless you rename it) and `link_status` reports `linked`.

The key is stored in `~/.config/storeshot/mcp-credentials.json` (or under `$XDG_CONFIG_HOME`), a
file only you can read (mode 0600 in a 0700 folder), one key per API address and environment. Set
`STORESHOT_MCP_NO_STORE=1` to keep the key in memory only.

To unlink: revoke the key in the console (API keys), then delete the file. A revoked stored key is
forgotten on its next use and a new link starts.

You can also give the server a key yourself with the `STORESHOT_API_KEY` environment variable of
the MCP client configuration; it always wins over a stored key.

## Test and live keys

Every key is a **test** key (`ss_test_…`) or a **live** key (`ss_live_…`):

- test keys never spend credits and return sample images of the exact store sizes, so an agent can
  rehearse the whole flow (upload, set, files in fastlane folders);
- live keys make the real marketing images and spend 1 credit per image.

Choose with `STORESHOT_ENVIRONMENT` (`test` or `live`) before the server links your account. When
it is unset the server asks for no environment and Storeshot's default applies (a live key today).
Either way the console shows the environment ("Live: real images, spends credits" or "Test: sample
images, free") before you approve, so you can deny and link again with the other one. With
`STORESHOT_API_KEY` the key decides. Every result says which environment produced it, and
`get_credits` shows the balance.

## Tools

| Tool                     | What it does                                                  | Credits                | Read-only | Destructive |
| ------------------------ | ------------------------------------------------------------- | ---------------------- | --------- | ----------- |
| `get_store_requirements` | Screenshot rules of the App Store and Google Play             | free                   | yes       | no          |
| `list_devices`           | Output sizes and their device ids                             | free                   | yes       | no          |
| `upload_screenshot`      | Uploads a local PNG, JPEG or WebP screenshot                  | free                   | no        | no          |
| `generate_screenshot`    | One image for one size                                        | 1 with a live key      | no        | no          |
| `create_screenshot_set`  | A whole listing in one job; `dryRun: true` quotes for free    | 1 per image, live keys | no        | no          |
| `get_job_status`         | Status of a generation or a set; `waitSeconds` waits for it   | free                   | yes       | no          |
| `download_results`       | Saves the images into a folder (`store` or `fastlane` layout) | free                   | no        | yes         |
| `get_credits`            | The credit balance and the key environment                    | free                   | yes       | no          |
| `link_status`            | Whether the server is linked, or the link and code to approve | free                   | yes       | no          |

Test keys never spend credits. `download_results` is marked destructive because `overwrite: true`
can replace existing files; without it nothing is ever replaced.

Typical flow: `get_store_requirements` → `upload_screenshot` for each raw screenshot →
`create_screenshot_set` (`dryRun: true` first with a live key) → `get_job_status` with
`waitSeconds` → `download_results` with `layout: "fastlane"` into your project root.

## Environment variables

| Variable                 | Default                        | Meaning                                                             |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------- |
| `STORESHOT_API_KEY`      | unset                          | Use this key (never stored); its prefix decides the environment     |
| `STORESHOT_ENVIRONMENT`  | unset                          | `test` or `live`: the environment of a linked key                   |
| `STORESHOT_BASE_URL`     | `https://api.storeshot.art/v1` | The API address (with or without `/v1`); https only                 |
| `STORESHOT_MCP_ROOT`     | unset                          | An absolute folder: every local read and write must be inside it    |
| `STORESHOT_MCP_NO_STORE` | unset                          | `1`: never read or write the credentials file                       |
| `STORESHOT_MCP_DEBUG`    | unset                          | `1`: stack traces of unexpected errors on stderr (never in results) |
| `XDG_CONFIG_HOME`        | `~/.config`                    | Where `storeshot/mcp-credentials.json` lives                        |

An invalid value is reported on stderr at start, and every tool answers `INVALID_CONFIGURATION`
with the reason.

## Local files

- `upload_screenshot` (and `{ "path": … }` inputs) reads only the file you name, and only a PNG,
  JPEG or WebP file of at most 20 MiB leaves your machine: anything else (a key file, a `.env`, a
  HEIC photo) is refused before any request.
- `download_results` writes only inside the folder you name (it is created if missing), never
  through symbolic links and never over an existing file unless `overwrite` is true. File names
  from the server are checked; an unsafe archive writes nothing.
- Set `STORESHOT_MCP_ROOT` to your project folder to keep both inside it. Paths must be absolute
  unless `STORESHOT_MCP_ROOT` is set (then they are relative to it).

## Checking with MCP Inspector

From a checkout, after the build, with your API key in the `STORESHOT_API_KEY` variable of your
shell:

```sh
npx @modelcontextprotocol/inspector --cli node packages/mcp-server/dist/bin.js --method tools/list
```

Without `--cli` the Inspector opens its web UI: all nine tools are listed with their input and
output schemas, and `get_store_requirements` can be called.

## Troubleshooting

- The protocol uses stdout; the server logs (link prompts, warnings, one line per failed tool call)
  go to stderr, which most clients show in their MCP log.
- Most clients stop a tool call after about 60 seconds unless they reset on progress. Keep
  `waitSeconds` at 50 or less and call `get_job_status` again until `final` is true.
- `ACCOUNT_LINK_PENDING`: the link has not been approved yet; `link_status` shows it again.
- Errors carry the Storeshot error code, the request id and what to do next, for example where to
  buy credits after `INSUFFICIENT_CREDITS`.

## Licence

Apache-2.0: see `LICENSE` and `NOTICE`.

## Source of truth

This repository is generated from the Storeshot monorepo, where the MCP server is developed
together with the API and the SDK it uses. Every Storeshot release that changes the server or the
API contract replaces the contents of this repository with one commit tagged `vX.Y.Z`.

Issues and pull requests are welcome here. Accepted changes are applied upstream and arrive with
the next release, so a pull request is closed rather than merged.

The package is not on npm yet. `.github/workflows/publish.yml` publishes it (with npm provenance)
once it is switched on.

### Development and tests

```sh
npm ci
npm run typecheck
npm test                # unit tests and the tool schema snapshot
npm run build
npm run test:bin        # the built server over stdio
npm run check:package   # the package exactly as npm would publish it
```

`contract/openapi.json` is the Storeshot API contract the credit costs in the tool descriptions are
checked against (the API serves it at https://api.storeshot.art/v1/openapi.json).
