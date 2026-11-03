# Copy-paste prompt

Paste this into your coding agent from the app's repository, once the Storeshot MCP server is added
(https://storeshot.art/docs/mcp/). Edit the stores and captions to taste.

```text
Make the App Store and Google Play screenshots of this app with the Storeshot MCP tools.
1. Call `get_store_requirements`, then find one raw screenshot per screen (simulator or device
   captures, portrait), the app name, a one-line description and a short caption per screen.
   Ask me for anything you cannot find.
2. Call `upload_screenshot` for each screenshot.
3. Call `create_screenshot_set` for both stores with `dryRun: true`, tell me the images and
   credits, and ask me before spending live credits (test keys are free sample images).
4. Create it, call `get_job_status` with waitSeconds 50 until final, then `download_results` with
   `layout: "fastlane"` into the project root.
If a tool answers ACCOUNT_LINK_REQUIRED, show me the link and the code and wait for my approval.
Never ask me to type an API key into the chat. Without the Storeshot tools, follow
https://storeshot.art/docs/agents-quickstart.md instead.
```
