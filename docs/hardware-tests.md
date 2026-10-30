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

## Phase 3: compiled programs on a real brick

The compiler is tested against the specification's example file and against a VM that
runs on the simulated brick, but only a real brick can confirm the details marked "to be
confirmed" in [spec/rxe.md](spec/rxe.md). Connect over USB, then:

1. **Spike program.** Open a new program with a Sound block (tone, 0.5 s), a Wait (0.5 s)
   and a Display block (text "Hello NXT"), then **Download and run**. The brick beeps, shows
   the text, and returns to its menu after about 3 s. If it shows **File Error**, save the
   .rxe (download without a brick connected) and send it to us.
2. **Branches.** File → Examples → Drive in a square, Download and run: the robot drives
   four sides and beeps once (loops and jumps work).
3. **Motor goals.** In the same program the robot must stop after each side and turn
   (waiting for a rotation goal reads RUN_STATE). If it never moves on from the first side,
   tell us.
4. **Sensors.** Bumper car (touch on 1) and Avoid obstacles (ultrasonic on 4). For the
   ultrasonic example, hold a hand 15 cm in front: the robot backs up.
5. **NXT 2.0 color sensor.** Put a Wait block for the Color Sensor (color mode, port 3)
   before a Sound block. Show it a red brick: the tone plays. Then the Color Lamp block
   (red, green, blue): the lamp changes colour. These type codes are not in the v1.0
   specification (see spec/rxe.md, "Beyond v1.0").
6. **Display and numbers.** Show distance example: the screen shows "Distance: N cm" and
   updates.
7. **Files.** A program with File Access write (number 42), close, read: Display shows 42.
   NXT window → Memory lists the .txt file.
8. **Two beams.** Drive and sing: the robot drives while the tune plays.
9. **Bluetooth messages (two bricks).** 5ButtonRemote/5ButtonSteer from nxtprograms.com:
   messages arrive in mailboxes 1 and 2.
