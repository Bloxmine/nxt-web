# Hardware test checklists

Each phase that needs a real brick adds a numbered checklist here. A phase is not done
until its checklist has passed on real hardware. Report results (and any captured
packets, which become fixtures) back in the issue or chat.

## Phase 0

No hardware needed. Manual check: run `pnpm dev`, open http://localhost:5173 in Chrome
on Linux and macOS, and confirm the shell loads with no browser-support banner. Open it
in Firefox and confirm the banner appears.
