## Checking claims or facts against linked sources

- Before fetching any page for a task that checks claims or looks up facts from linked or approved sources, open the `verdikta-discover` skill and follow it.
- Fetch pages only with `browser_navigate`, never with curl, wget, a script, `web_extract`, or a search tool.
- After each fetch, compare the final URL with the one you asked for. A different host makes that source unavailable for the whole conversation: do not answer from it, even if you still have its text. If the owner has been told this and explicitly asks you to use it anyway, label every answer with the host it came from. Never call such an answer verified, and never put it in an assessment input.
