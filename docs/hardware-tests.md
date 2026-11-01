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
install `docs/udev/70-nxt.rules` first.

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
   Then a File Access read of a file that doesn't exist, its **Error** wired to a Switch
   that shows "missing" or "found": it shows "missing"; after writing the file, "found".
   (Open NXT 1.0's LockBox from nxtprograms.com for a real program that does this.)
8. **Two beams.** Drive and sing: the robot drives while the tune plays.
9. **Bluetooth messages (two bricks).** 5ButtonRemote/5ButtonSteer from nxtprograms.com:
   messages arrive in mailboxes 1 and 2.

## Brick tools (file manager, monitor, remote, health, data logging)

1. **Files** (Tools → Files on the brick): the list matches the brick's My Files. Upload
   a WAV file: it becomes an .rso; Preview plays it in the browser, and the brick plays it
   from My Files › Sound files. Upload a PNG: it becomes an .ric; check it on the brick's
   screen (e.g. with a Display block). (Sprite bit order and placement are confirmed;
   see docs/spec/media.md.) Download, Delete and Run
   (on an .rxe) work.
2. **Monitor**: choose Ultrasonic on port 4; the distance changes as you move a hand.
3. **Remote control** (Tools → Remote control, Drive: the brick):
   - _Two-wheel robot_ controls, motors on B and C: the arrow keys drive; letting go
     stops; Shift boosts; 1/2/3 change the speed; H sounds the horn; the joystick works.
   - Unplug nothing, switch to another window while driving: the motors stop.
   - _Car with a steering motor_ (for example the race car, steering on A): Steering →
     Find the ends. The steering turns slowly to each end and stops there without
     grinding for long, then centres. Note the range it found and whether the centre
     really is straight. Then steer with ← and →: the wheels stop just before each end
     (watch the "at limit" flag), even when holding the key, and straighten on release.
     Note any overshoot in degrees (the Position readout) over USB and over Bluetooth.
   - Motors tab: tick Reversed on a drive motor: forward now turns it the other way.
   - Keys: record Shift + Q to run motor A at 30% and Q alone at −30%: each does its own.
   - A gamepad (if you have one): record a stick for steering; half-way steers half-way.
   - Sequences: Run B+C at 50% for 360 degrees, then a tone. Try it: the wheels turn
     about one rotation (check the degrees in the readout), then it beeps.
4. **Health check**: lift the robot, run it; each connected motor shows "turned …°", an
   empty port shows a problem. The battery chart grows every 5 s.
5. **Data logging** (Tools → Data logging): light sensor on port 3, record for 10 s while
   moving it over black and white; Save CSV opens in a spreadsheet.
6. **Calibrate sensor**: select a Wait for light block, Tools → Calibrate sensor, read
   dark and light, Use: the block's trigger value is the midpoint.
7. **Brick screen** (Tools → Brick screen): the picture matches the brick's own screen
   (menu text the right way up, not mirrored); it follows when you browse the brick's
   menus. Note the updates per second over USB and over Bluetooth. Save picture saves a
   PNG. (Layout from docs/spec/display-iomap.md.)
8. **Sound recorder** (Tools → Sound recorder): record "hello", trim it, Send to brick;
   the brick plays it from My Files › Sound files, and a Sound block can use it.
9. **Picture editor** (Tools → Picture editor): draw text and a box, Send to brick. Add a
   Display block, Action Image: the File list shows the picture under "On the brick"
   (↻ re-reads the list). With X 0, Y 0, Download and run: the brick shows it the same
   way up and in the same place as the simulator does.

10. **Animation from GIF** (Tools → Animation from GIF): open an animated GIF, Send to
    brick, then Make a program and Download and run: the brick plays the frames in a
    loop at about the preview's speed. Note any flicker between frames.

## Recording a capture

Real replies make the best protocol tests. Connect over USB, then **Tools → Record USB
traffic**, do something (open the NXT window, play a tone, upload a program), and choose
**Tools → Stop recording and save…**. Describe what you did when asked, and add the saved
`capture-….json` to `fixtures/captures/`: `pnpm test` replays it through the client.

## Save back to NXT-G (.rbt)

Needs the NXT-G 2.x software.

1. Open `BumperCar.rbt` (or any of your programs) in NXT Web Studio. Change the first
   Move block's power to 50 and its duration to 2 seconds, and the Wait's sensor to
   "released". File → Save back to NXT-G.
2. Open the saved file in NXT-G: it opens without errors, the Move block's panel shows
   power 50 and 2 seconds, the Wait shows "Released".
3. Download it from NXT-G to the brick and run it: the robot drives with the new settings.
4. Open a Pack and Go file (e.g. SuGO from sugobot.com): My Blocks show their parameters
   as plugs on the call and as parameter blocks inside.

Tell us about any difference; it means one of the two copies of a setting
(docs/rbt-compat.md, "Settings tag versus defaults") is wrong.
