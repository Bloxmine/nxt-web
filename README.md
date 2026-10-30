# NXT Web Studio

Visual, block-based programming for the NXT brick, running entirely in your browser.
Drag blocks, click Run, and the robot moves. No install and no server.

> Independent project, not affiliated with the LEGO Group. See [NOTICE](NOTICE).

**Status:** the editor and brick connection work; compiling programs for the brick is next.
See [PLAN.md](PLAN.md) for the roadmap and [docs/hardware-tests.md](docs/hardware-tests.md)
for what to test on a real brick.

The editor follows the classic NXT 2.0 software: a sequence beam with blocks, loops and
switches, fold-out data hubs with wires, parallel beams, a configuration panel and a
controller. Try `?example=distance` or `?example=parallel` in the URL.

**Opens original NXT-G programs:** File → Open (or drop a file on the window) accepts `.rbt`
files from the NXT 2.0 software. See [docs/rbt-compat.md](docs/rbt-compat.md).

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

| Command                  | What it does                                                                |
| ------------------------ | --------------------------------------------------------------------------- |
| `pnpm dev`               | Vite dev server for `apps/web`                                              |
| `pnpm test`              | Vitest in every package                                                     |
| `pnpm typecheck`         | `tsc --noEmit` in every package                                             |
| `pnpm lint`              | ESLint across the repo                                                      |
| `pnpm format`            | Prettier, writes changes                                                    |
| `pnpm build`             | Production build to `apps/web/dist`                                         |
| `pnpm fetch:nxtprograms` | Download sample .rbt programs for local compatibility tests (not committed) |

See [docs/architecture.md](docs/architecture.md) for how the code is organised.

## Licence

[MIT](LICENSE). Icons: [FatCow Farm-Fresh](http://www.fatcow.com/free-icons) (CC BY 3.0).
