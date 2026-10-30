# NXT Web Studio

Visual, block-based programming for the NXT brick, running entirely in your browser.
Drag blocks, click Run, and the robot moves. No install and no server.

> Independent project, not affiliated with the LEGO Group. See [NOTICE](NOTICE).

**Status:** Phase 0 (scaffolding). See [PLAN.md](PLAN.md) for the roadmap.

## Requirements

- Chrome, Edge, Brave or Opera (current version) on Linux or macOS. Firefox and Safari lack WebUSB.
- On Linux, a udev rule so the browser can open the brick (see [docs/udev/](docs/udev/)).

## Development

Requires Node 22+ and pnpm.

```sh
pnpm install
pnpm dev        # start the app at http://localhost:5173
pnpm check      # lint, format check, typecheck, test, build
```

| Command          | What it does                        |
| ---------------- | ----------------------------------- |
| `pnpm dev`       | Vite dev server for `apps/web`      |
| `pnpm test`      | Vitest in every package             |
| `pnpm typecheck` | `tsc --noEmit` in every package     |
| `pnpm lint`      | ESLint across the repo              |
| `pnpm format`    | Prettier, writes changes            |
| `pnpm build`     | Production build to `apps/web/dist` |

See [docs/architecture.md](docs/architecture.md) for how the code is organised.

## Licence

[MIT](LICENSE)
