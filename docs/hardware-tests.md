# Hardware test checklists

Each phase that needs a real brick adds a numbered checklist here. A phase is not done
until its checklist has passed on real hardware. Report results (and any captured
packets, which become fixtures) back in the issue or chat.

## Phase 0

No hardware needed. Run `pnpm dev`, open http://localhost:5173 in Chrome on Linux and
macOS, and confirm the app loads with no browser-support banner. Open it in Firefox and
confirm the banner appears.

## Phase 1: protocol over USB

Setup: brick with standard firmware (1.2x/1.3x), fresh batteries, USB cable. On Linux,
install `docs/udev/99-nxt.rules` first.

1. Toolbar → brick status box → **Connect via USB**. Pick the brick in the browser's list.
   - Expected: the status box shows the brick name and battery voltage.
2. NXT window → Communications. Check **Name**, **Firmware version** (e.g. 1.31) and
   **Battery** against the brick's own Settings menu.
3. Monitor tab → **Play tone** at 440 Hz. The brick beeps.
4. Plug a motor into port A. Set the slider to 50, press ▶. The motor turns and the
   degree counter rises. Press **Stop**. Press **0**: the counter resets.
5. Set the slider to −50 and press ▶: the motor turns the other way, the counter falls.
6. Plug a touch sensor into port 1, choose **Touch** for Port 1. Press and release:
   the reading changes between Pressed and Released within half a second.
7. Light sensor on port 3, choose **Light (floodlight on)**: the red light turns on and
   the reading changes when you cover it.
8. Memory tab: the file list matches the brick's My Files.
9. Rename the brick (Communications → Rename…) and check the brick's screen.
10. Pull the USB cable. The status box shows "No brick connected" within a few seconds.
    Plug it back in and press Connect again: it reconnects without reloading the page
    and without showing the picker.
11. Note: the protocol spec says SETOUTPUTSTATE's tacho limit is "bytes 8–12" but is a
    4-byte value; we send 12 bytes. If step 4 fails with "Insane packet" or
    "Illegal size", tell us: we'll send 13.

Optional, Bluetooth (experimental): pair the brick with the computer (passkey 1234), then
**Bluetooth (experimental)** and pick its serial port. Repeat steps 2 and 3.

## Phase 2: editor

No hardware needed.

1. File → Examples → each example opens; File → Save, then New, then Open brings it back.
2. Reload the page: the last program is restored.
3. Drag a Move block onto the beam, set Port to none: a red mark appears and
   Download and run explains the problem.
4. Open "Show distance": drag from a Value plug to a Number plug to make a wire; try a
   text plug to a number plug and check it is refused with a message.
5. Drag the start node downwards: a parallel beam appears.
