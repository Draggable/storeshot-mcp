---
name: storeshot
description: Creates App Store and Google Play marketing screenshots from an app's raw screenshots with Storeshot - reads the store rules, uploads the screenshots, quotes and creates a screenshot set, and saves the images into the project, fastlane folders included. Use when the user asks for store screenshots, App Store or Google Play listing images, or fastlane screenshot folders.
license: Apache-2.0
compatibility: Works best with the Storeshot MCP server (npx -y @draggable/storeshot-mcp, Node 18+); without it, needs curl, jq and unzip with network access to api.storeshot.art.
---

# Storeshot: store screenshots

Storeshot turns the raw screenshots of an app (simulator or device captures) into the marketing
images the App Store and Google Play require, at every required size, with a caption per screen.

## When to use

- The user wants App Store or Google Play screenshots, listing images or a feature graphic.
- The project uses fastlane (`deliver`, `supply`) and needs its screenshot folders filled.

## With the Storeshot MCP tools

The tools come from the Storeshot MCP server (`npx -y @draggable/storeshot-mcp`; setup for every
client: https://storeshot.art/docs/mcp/).

1. `get_store_requirements` for the stores the app ships to; `list_devices` only to choose sizes
   other than the defaults.
2. Find one raw screenshot per screen (portrait, PNG, JPEG or WebP; not HEIC) in the order the
   listing should show them, plus the app name, a one-line description and a short caption per
   screen. Ask the user for anything missing.
3. `upload_screenshot` once per file; keep the `uploadId`s.
4. `create_screenshot_set` with `dryRun: true` first. With a live key, tell the user the credits
   it costs and ask the user before creating it.
5. `create_screenshot_set` without `dryRun`, then `get_job_status` with `waitSeconds` of 50 or
   less, again until `final` is true.
6. `download_results` with `layout: "fastlane"` into the project root (or `layout: "store"` into a
   folder the user names). Never pass `overwrite: true` unless the user asked to replace files.

| Tool                     | What it does                                      | Credits                | Read-only |
| ------------------------ | ------------------------------------------------- | ---------------------- | --------- |
| `get_store_requirements` | Screenshot rules of the App Store and Google Play | free                   | yes       |
| `list_devices`           | Output sizes and their device ids                 | free                   | yes       |
| `upload_screenshot`      | Uploads a local PNG, JPEG or WebP screenshot      | free                   | no        |
| `generate_screenshot`    | One image for one size                            | 1 with a live key      | no        |
| `create_screenshot_set`  | A whole listing in one job; `dryRun` quotes       | 1 per image, live keys | no        |
| `get_job_status`         | Status of a generation or a set                   | free                   | yes       |
| `download_results`       | Saves the images into a folder                    | free                   | no        |
| `get_credits`            | Credit balance and key environment                | free                   | yes       |
| `link_status`            | Whether the server is linked                      | free                   | yes       |

## Keys and credits

- Test keys (`ss_test_…`) are free and return sample images of the exact sizes: use them to
  rehearse. Live keys (`ss_live_…`) make the real images and spend 1 credit per image.
- Always quote first and ask the user before spending live credits.
- Never ask for an API key in the chat, never print one and never write one to a file. If a tool
  answers `ACCOUNT_LINK_REQUIRED`, show the user the link and the code, wait for their approval,
  then call `link_status`.

## Without the MCP tools

Follow the agent quickstart, which does the same with `curl` and `jq` against the REST API:
https://storeshot.art/docs/agents-quickstart.md
