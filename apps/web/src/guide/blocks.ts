/**
 * The block reference chapters of the user guide: every block's settings, data plugs
 * and behaviour. Same markup as content.ts. Section ids start with "block-"; the
 * palette entries point at them through BLOCK_SECTIONS.
 */
import type { GuideChapter } from './content';

export const BLOCK_CHAPTERS: GuideChapter[] = [
  {
    id: 'ref-action',
    title: 'Blocks: Action',
    icon: 'lightning',
    sections: [
      {
        id: 'block-reading',
        title: 'How to read the block reference',
        body: `These chapters describe every block, grouped like the **Complete** palette: Action, Sensor, Flow, Data and Advanced. The **Common** palette holds the six you use most: Move, Sound, Display, Wait, Loop and Switch.

For each block you'll find:

- **Settings**: what you set in the configuration panel when the block is selected.
- **Data hub**: the block's plugs. Inputs are on the left of the hub, outputs on the right. A wire into an input replaces that setting while the program runs. Most inputs also pass their value on through an output on the same row, so you can wire it further.
- Tips and things to watch out for.

Wire colours show the kind of value: yellow for numbers, green for logic (yes/no) and orange for text. See [[Data hubs and wires|#data]].

Note: On the brick, numbers are whole numbers: decimals are dropped, so 7 ÷ 2 gives 3. The simulator keeps decimals, so a calculation can come out slightly differently there.

Tip: Select any block and Little Help (bottom right) shows a short description, tips and example programs that use it.`,
      },
      {
        id: 'block-move',
        title: 'Move',
        body: `Drives motors together, usually the two wheels of a robot, so it goes straight or turns. It starts with motors B and C, power 75, for 1 rotation.

Settings:

- **Port**: tick the motors to drive (A, B and/or C).
- **Direction**: forward, backward or stop. Stop brakes or coasts the motors, as Next action says.
- **Steering** (two motors only): 0 drives straight. Towards one end, that side's motor slows down: at 50 it stands still and the robot turns around that wheel; at 100 the motors turn opposite ways and the robot spins on the spot.
- **Power**: 0–100 %.
- **Duration**: Unlimited, Degrees, Rotations or Seconds. Degrees and rotations count the fastest motor.
- **Next action**: **Brake** stops at once and holds the position; **Coast** lets the robot roll to a stop.

Data hub:

- **Direction** (logic in): yes is forward, no is backward.
- **Steering** (number in): −100 to 100.
- **Power** (number in): 0–100.
- **Duration** (number in): replaces the amount, in the unit you chose (degrees, rotations or seconds).

With Degrees, Rotations or Seconds the block waits until the motors are done. With **Unlimited** the motors start and the program goes straight on, so follow it with a Wait (or a Loop) that decides when to stop.

Tip: Tools → **Distance and turn calculator** works out the degrees for a distance or a turn of your robot.

Warning: Don't drive the same motor from two parallel beams at once.`,
      },
      {
        id: 'block-motor',
        title: 'Motor',
        body: `Controls one motor, for example an arm, a claw or a turntable. It starts with motor A, power 75, unlimited.

Settings:

- **Port**: A, B or C.
- **Direction**: forward, backward or stop.
- **Power**: 0–100 %.
- **Control**: **Motor power** keeps the speed steady under load by giving the motor more power when it's slowed down. Untick it for a softer motor that gives way (good for a claw that grips).
- **Duration**: Unlimited, Degrees, Rotations or Seconds.
- **Wait**: with **Wait for completion** the program waits until the motor has turned the degrees or rotations; untick it to start the motor and go straight on.
- **Next action**: Brake or Coast.

Data hub: **Direction** (logic in, yes = forward), **Power** (number in) and **Duration** (number in, in the unit you chose).

Tip: Use Move to drive with two wheels and Motor for everything else.

Warning: A motor that can't turn any further (an arm at its end stop) never finishes a turn of degrees or rotations, so a block that waits for it waits for ever. Use Seconds, or a Wait for the rotation sensor with a time limit, for mechanisms with an end stop.`,
      },
      {
        id: 'block-sound',
        title: 'Sound',
        body: `Plays a tone or a sound file on the brick's loudspeaker, or stops the sound that's playing.

Settings:

- **Action**: **Tone**, **Sound file** or **Stop**.
- **Tone**: the frequency in Hz (200–14 000), or pick a note from C4 to A5. **Duration**: how many seconds the tone lasts.
- **File**: a sound file (\`.rso\`) on the brick. The list shows the sounds this browser knows; make your own with Tools → **Sound recorder**.
- **Volume**: 0–100 %.
- **Wait**: **Wait for completion** waits until the sound ends. **Repeat** (sound files only) plays the file again and again until a Sound block with Stop, or the end of the program; a repeating sound never waits.

Data hub: **Tone** (number in, Hz) and **Volume** (number in).

Tip: Untick Wait to keep driving while a sound plays, for example a horn while the robot moves.`,
      },
      {
        id: 'block-display',
        title: 'Display',
        body: `Shows text, a number, a picture or a drawing on the brick's screen, or clears it. The screen is 100 pixels wide and 64 high.

Settings:

- **Action**: **Text**, **Number variable** (shows a number variable), **Image**, **Drawing** or **Clear screen**.
- **Text**: the text to show.
- **Variable**: the number variable to show.
- **File** (Image): a picture (\`.ric\`) on the brick. The panel shows a preview of how it will look. Draw your own with Tools → **Picture editor**.
- **Position**: for text and numbers, **X** (0–99 pixels from the left) and **Line** (1–8 from the top; each line is 8 pixels high). For pictures, X and **Y** in pixels, where Y = 0 is the bottom row.
- **Shape** (Drawing): a **Point**, a **Line** from one point to another, or a **Circle** with a radius. Positions are pixels; Y = 0 is the bottom row.
- **Display**: **Clear first** wipes the screen before drawing; untick it to add to what's there.

Data hub: **Text** (text in), **Number** (number in: replaces the variable with Number variable), **X**, **Y**, **End X**, **End Y** and **Radius** (numbers in). A wired Y moves text to the line at that height.

Tip: To show a number together with words, turn it into text with a **Number to Text** block and join it with a **Text** block.

Warning: The brick goes back to its menu when a program ends, and what you showed disappears. End with a Wait to read the screen first.`,
      },
      {
        id: 'block-color-lamp',
        title: 'Color Lamp',
        body: `Switches the lamp of the NXT 2.0 color sensor on in red, green or blue, or off. Handy as a signal light, or to see which colour the robot is "thinking" of.

Settings:

- **Port**: the sensor port (1–4) the color sensor is on (3 to start with).
- **Action**: On or Off.
- **Color**: red, green or blue.

Note: A Color sensor block or Wait that reads colours uses the lamp itself, and changes it.`,
      },
    ],
  },
  {
    id: 'ref-sensor',
    title: 'Blocks: Sensor',
    icon: 'radar_chart',
    sections: [
      {
        id: 'block-sensors',
        title: 'Sensor blocks in general',
        body: `A sensor block reads a sensor once, the moment it runs, and doesn't wait. It hands the reading on through its data hub, so you can show it, calculate with it, or let a Switch or Loop decide on it. To wait for something to happen, use a **Wait** instead.

Most sensor blocks have the same plugs:

- **Trigger** (number in): the level to compare with, instead of the one you set.
- **Yes / No** (logic out): yes when the reading meets the setting (for example "distance < 50").
- **Value** (number out): the reading itself.

Default ports, as on the standard robot: touch on 1, sound on 2, light or color on 3, ultrasonic on 4. Change the port to where your sensor really is.

Tip: Tools → **Calibrate sensor** sets a light or sound level from real readings: hold the sensor over dark and light, and it takes the middle.`,
      },
      {
        id: 'block-touch',
        title: 'Touch sensor',
        body: `Reads whether the touch sensor's button is pressed.

Settings: **Port** (1 to start with) and **Action**: Pressed, Released or Bumped.

Data hub: **Yes / No** (logic out): yes when the button is as you chose. **Bumped** means "pressed and let go again": a Wait waits for the whole bump, but in a sensor block, Switch or Loop it counts as Pressed.

Tip: In the simulator the touch sensor is a bumper on the front of the robot; it's pressed when the robot drives into a wall.`,
      },
      {
        id: 'block-light',
        title: 'Light sensor',
        body: `Reads how much light the NXT light sensor sees, from 0 (dark) to 100 (bright).

Settings:

- **Port** (3 to start with).
- **Until**: \`<\` or \`>\` and a level, 0–100.
- **Function**: **Generate light** switches on the sensor's own red lamp, so it measures light reflected from the surface below (for following lines). Untick it to measure the light in the room.

Data hub: **Trigger** (number in), **Yes / No** (logic out) and **Value** (number out, 0–100).

Tip: Real readings rarely use the whole range: a black line might read about 30 and white paper about 60. Measure your own mat with Tools → Calibrate sensor or NXT window → Monitor.`,
      },
      {
        id: 'block-sound-sensor',
        title: 'Sound sensor',
        body: `Reads how loud it is, from 0 (silent) to 100 (very loud).

Settings: **Port** (2 to start with), **Until** (\`<\` or \`>\` and a level) and **Mode**: **dBA** weighs sounds as human ears hear them; without it, all sounds the sensor picks up count (dB).

Data hub: **Trigger** (number in), **Yes / No** (logic out) and **Value** (number out, 0–100).

Tip: In the simulator, the microphone slider sets what the sound sensor hears. Clap programs are easiest to try that way.`,
      },
      {
        id: 'block-ultrasonic',
        title: 'Ultrasonic sensor',
        body: `Measures the distance to the nearest object in front of the sensor, like a bat, with sound you can't hear.

Settings: **Port** (4 to start with) and **Until**: \`<\` or \`>\`, a distance (0–255) and the unit, **cm** or **inches**.

Data hub: **Trigger** (number in), **Yes / No** (logic out) and **Value** (number out): the distance in centimetres, up to 255 (the farthest it reports).

Note: Soft, round or slanted objects can reflect the sound away, so the real sensor may not see them; the simulator sees every wall.`,
      },
      {
        id: 'block-color-sensor',
        title: 'Color sensor',
        body: `Reads the NXT 2.0 color sensor, in one of two modes.

- **Color** mode recognises six colours: black, blue, green, yellow, red and white. **Until** sets a range of them, **inside** or **outside**. For one colour, pick it as both ends of the range (red to red). Colours count in this order: 1 black, 2 blue, 3 green, 4 yellow, 5 red, 6 white.
- **Light level** mode measures light (0–100) like the light sensor, with the lamp in **red**, **green**, **blue** or **none** (ambient light).

Settings: **Port** (3 to start with), **Mode**, and the range or the level.

Data hub:

- Color mode: **Yes / No** (logic out) and **Color** (number out, 1–6).
- Light level mode: **Trigger** (number in), **Lamp color** (number in: 0 red, 1 green, 2 blue), **Lamp on** (logic in), **Yes / No** (logic out) and **Value** (number out).

Tip: Show the colour number on the screen while you hold the sensor over each colour on your mat: that tells you which range to set.`,
      },
      {
        id: 'block-rotation',
        title: 'Rotation sensor',
        body: `Every NXT motor has a built-in rotation sensor that counts how far it has turned, in degrees (360 per rotation). This block reads that count.

Settings: **Port** (motor A, B or C) and **Until**: \`<\` or \`>\` and an amount in **Degrees** or **Rotations**.

Data hub: **Trigger** (number in), **Yes / No** (logic out) and **Value** (number out: whole degrees; backwards counts down).

Tip: Use **Reset Rotation** before measuring a new distance, so the count starts at 0.`,
      },
      {
        id: 'block-timer',
        title: 'Timer',
        body: `The brick has three timers that start counting when the program starts.

Settings: **Timer** (1, 2 or 3) and **Until**: \`<\` or \`>\` and a number of seconds.

Data hub: **Trigger** (number in), **Yes / No** (logic out) and **Value** (number out): the time in milliseconds (1000 per second).

Tip: Put **Reset Timer** where your measurement starts, for example "how long did it take to reach the wall?".`,
      },
      {
        id: 'block-buttons',
        title: 'NXT buttons',
        body: `Reads the buttons on the brick: **Enter** (the orange one), **Left** or **Right**. The dark grey button stops a program and can't be read.

Settings: **Button** and **Action**: Pressed, Released or Bumped (in a sensor block, Switch or Loop, Bumped counts as Pressed).

Data hub: **Yes / No** (logic out).

Tip: In the simulator, click the buttons below its screen, or use \`←\`, \`Enter\` and \`→\` while the simulator window has focus.`,
      },
      {
        id: 'block-reset-rotation',
        title: 'Reset Rotation',
        body: `Sets a motor's rotation count back to 0.

Settings: **Port** (A, B or C).

Use it before you measure: reset, drive, then read the rotation sensor to see how far the motor turned.`,
      },
      {
        id: 'block-reset-timer',
        title: 'Reset Timer',
        body: `Starts a timer again from 0.

Settings: **Timer** (1, 2 or 3).

Then read the timer with a Timer sensor block, or wait for it with a Wait.`,
      },
    ],
  },
  {
    id: 'ref-flow',
    title: 'Blocks: Flow',
    icon: 'arrow_branch',
    sections: [
      {
        id: 'block-wait',
        title: 'Wait',
        body: `Pauses its beam until something happens. The palettes have ready-made Waits for time, touch, light, sound, distance, colour, rotation, timer and buttons; you can change any Wait into another kind with **Control**.

Settings:

- **Control**: **Time**, or a sensor, a timer, a button or a variable (see [[What Wait, Loop and Switch can test|#block-conditions]]).
- **Until**: for Time, the number of seconds; otherwise the condition to wait for.

A Wait checks its condition again and again and lets the program go on as soon as it's met.

Tip: A Wait after a Move with **Unlimited** duration is the usual way to drive "until something happens".

Note: A Wait only pauses its own beam; parallel beams keep running.`,
      },
      {
        id: 'block-conditions',
        title: 'What Wait, Loop and Switch can test',
        body: `Wait, Loop and Switch can all test the same things:

- **Touch sensor**: pressed, released or bumped.
- **Light sensor**, **Sound sensor**: below or above a level (0–100).
- **Ultrasonic sensor**: nearer or farther than a distance.
- **Color sensor**: a colour inside or outside a range, or a light level with a lamp colour.
- **Rotation sensor**: a motor's count below or above degrees or rotations.
- **Timer**: below or above a number of seconds.
- **NXT buttons**: Enter, Left or Right pressed, released or bumped.
- **Variable**: a number variable \`<\`, \`>\` or \`=\` a value.

Loop and Switch can also use a **logic** value you wire in, and a Switch can choose on a **number or text** you wire in.

The sensor settings mean the same as on the sensor blocks: see [[Sensor blocks in general|#block-sensors]].`,
      },
      {
        id: 'block-loop',
        title: 'Loop',
        body: `Repeats the blocks inside it. Drop blocks onto the loop's inner beam; the loop grows to fit.

**Control** sets how long it repeats:

- **Forever**: until the program is stopped.
- **Count**: a number of times.
- **Time**: until a number of seconds have passed.
- A **sensor**, **timer**, **button** or **variable**: until the condition is met.
- **Logic (wired value)**: until the yes/no value wired into the loop's **Until** plug is yes.

**Counter**: **Show counter plug** gives the loop a **Count** output.

The condition is checked after each pass, so the blocks inside always run at least once, and a Time loop finishes its last pass before it stops.

Data hub: **Until** (logic in, with Logic control) and **Count** (number out): how many passes have finished, so 0 during the first pass.

Tip: A Loop with a Switch inside is the classic way to keep reacting to a sensor, for example to follow a line.`,
      },
      {
        id: 'block-switch',
        title: 'Switch',
        body: `Chooses between beams. With a sensor or condition, it has two: the **top** beam runs when the condition is true, the **bottom** beam when it's false. Drop blocks onto either beam.

Settings:

- **Control**: a sensor, timer, button or variable condition; **Logic (wired value)**, where a yes/no wired into the switch decides; or **Value (wired number or text)**.
- With **Value**, choose Number or Text and list the **Cases**: the switch runs the beam whose value matches the wired value. **+ Case** and **− Case** add and remove beams, and the marked case is the **default**, which runs when nothing matches.

The switch reads its sensor once, when the program reaches it, then runs one beam. To keep checking, put the Switch inside a Loop.

Data hub: **Value** (logic, number or text in) for the wired kinds.`,
      },
      {
        id: 'block-stop',
        title: 'Stop',
        body: `Ends the whole program when it's reached, including all parallel beams, and turns the motors off.

It has no settings. Put it inside a Switch to stop only when something happens, for example when an emergency touch sensor is pressed.`,
      },
    ],
  },
  {
    id: 'ref-data',
    title: 'Blocks: Data',
    icon: 'database',
    sections: [
      {
        id: 'block-logic',
        title: 'Logic',
        body: `Combines yes/no values.

Settings: **Operation** and the values of **A** and **B** (True or False) for inputs that aren't wired.

- **And**: yes when A and B are both yes.
- **Or**: yes when A or B (or both) is yes.
- **Xor**: yes when exactly one of A and B is yes.
- **Not**: yes when A is no (only A is used).

Data hub: **A**, **B** (logic in) and **Result** (logic out).

Example: "stop when the touch sensor is pressed **or** the distance is below 10 cm".`,
      },
      {
        id: 'block-math',
        title: 'Math',
        body: `Calculates with two numbers.

Settings: **Operation** (Addition, Subtraction, Multiplication or Division) and the numbers **A** and **B** for inputs that aren't wired.

Data hub: **A**, **B** (number in) and **Result** (number out).

Note: On the brick, numbers are whole numbers, so 7 ÷ 2 gives 3. In the simulator, dividing by 0 gives 0.`,
      },
      {
        id: 'block-compare',
        title: 'Compare',
        body: `Compares two numbers and gives a yes or no.

Settings: **Operation** (Less than, Greater than or Equals) and the numbers **A** and **B** for inputs that aren't wired.

Data hub: **A**, **B** (number in) and **Result** (logic out): yes when "A < B" (or > or =) is true.

Tip: Wire the result into a Switch or a Loop with Logic control.`,
      },
      {
        id: 'block-range',
        title: 'Range',
        body: `Checks whether a number lies between two others.

Settings: **Operation** (Inside range or Outside range), **Range** (Low and High) and the **Test value** when it isn't wired. Low and High count as inside.

Data hub: **Low**, **High**, **Test value** (number in) and **Yes / No** (logic out).

Example: "is the light reading between 40 and 60?" for following the edge of a line.`,
      },
      {
        id: 'block-random',
        title: 'Random',
        body: `Gives a random whole number between a minimum and a maximum (both included), a new one each time the block runs.

Settings: **Range** (Minimum and Maximum).

Data hub: **Min**, **Max** (number in) and **Number** (number out).

Example: wire it into a Move block's Steering for a robot that wanders around.`,
      },
      {
        id: 'block-variable',
        title: 'Variable',
        body: `Reads or changes a variable: a named place that keeps a value while the program runs. Make variables with **Edit variables…** (or Edit → Define variables); each holds a number, a logic value or text.

Settings:

- **Variable**: which one.
- **Action**: **Read** gives its value; **Set to** gives it a new value; **Change by** adds to it (a negative amount subtracts). Change by is for number variables only.
- **Value**: the number to set or add, when the plug isn't wired.

Data hub: **Value**: an output when reading; an input (wire a value in) when setting or changing.

Tip: Variables can carry a value from one beam to another, and Wait, Loop and Switch can test a number variable directly.`,
      },
      {
        id: 'block-constant',
        title: 'Constant',
        body: `Gives a fixed value to wire into other blocks: a number, a logic value or text.

Settings: **Type** (Number, Logic or Text) and the **Value**.

Data hub: **Value** (out).

Tip: When several blocks need the same number (a speed, a distance), wire them all from one Constant; then you change it in one place.`,
      },
      {
        id: 'block-my-block-param',
        title: 'My Block parameter',
        body: `Used inside a My Block, to give it plugs of its own. Each parameter block becomes a plug on the My Block's data hub.

Settings:

- **Name**: the plug's name.
- **Direction**: **Input**: the caller wires a value in, and this block hands it out inside the My Block. **Output**: wire a value into this block, and the My Block hands it back out.
- **Type**: Number, Logic or Text.

Example: a "Drive cm" My Block with an input parameter **Distance**, wired into a Math block that works out the degrees for a Move.

See [[My Blocks: your own blocks|#myblocks]].`,
      },
    ],
  },
  {
    id: 'ref-advanced',
    title: 'Blocks: Advanced',
    icon: 'application_xp_terminal',
    sections: [
      {
        id: 'block-number-to-text',
        title: 'Number to Text',
        body: `Turns a number into text, for example to show it with a Display block or to join it to other text.

Settings: **Number**, when it isn't wired.

Data hub: **Number** (number in) and **Text** (text out).`,
      },
      {
        id: 'block-text',
        title: 'Text',
        body: `Joins up to three pieces of text into one, in the order A, B, C.

Settings: the texts **A**, **B** and **C** for inputs that aren't wired. Add spaces yourself where you want them, such as "Distance: ".

Data hub: **A**, **B**, **C** (text in) and **Text** (text out).

Example: "Distance: " + (a Number to Text of the ultrasonic reading) + " cm", wired into a Display block.`,
      },
      {
        id: 'block-file',
        title: 'File Access',
        body: `Reads and writes text files on the brick, for example to keep measurements or a high score after the program ends.

Settings:

- **Action**: **Read**, **Write**, **Close** or **Delete**.
- **Name**: the file name (up to 15 characters); \`.txt\` is added when missing.
- **Type** (read and write): **Text** or **Number**.
- **Value** (write): the text or number to write, when it isn't wired.

Each Write adds a line to the end of the file. Each Read reads the next line; at the end of the file you get empty text or 0. **Close** finishes with a file, so the next Read starts at the top again. **Delete** removes the file from the brick.

Data hub: **Filename** (text in), **Text** and **Number** (in when writing, out when reading), **File size** (number in: bytes to reserve when the file is made) and **Error** (logic out).

Note: The Error plug is always no for now; a missing file reads as empty text or 0.

Tip: See the files on the brick, and download them to your computer, in the NXT window's Files tab.`,
      },
      {
        id: 'block-send-message',
        title: 'Send Message',
        body: `Sends a message over Bluetooth to another brick's mailbox.

Settings:

- **Connection**: 0 sends to the master brick; 1, 2 or 3 send to the slave brick on that connection of the master.
- **Mailbox**: 1–10.
- **Type**: Text, Number or Logic, and the **Message**. Text messages hold up to 58 characters.

Data hub: **Mailbox** (number in) and **Message** (in, of the chosen type).

Note: The bricks have to be paired and connected first, in the Bluetooth menu of the bricks themselves. Try it without bricks in the simulator: Bluetooth messages → **Second brick**.`,
      },
      {
        id: 'block-receive-message',
        title: 'Receive Message',
        body: `Takes a message out of one of this brick's mailboxes. Messages wait in the mailbox in the order they arrived, and each Receive Message takes the oldest. A mailbox keeps up to five; when another arrives, the oldest is dropped.

Settings: **Mailbox** (1–10) and **Type** (Text, Number or Logic: the same type the sender uses).

Data hub:

- **Mailbox** (number in).
- **Received** (logic out): yes when a message was there.
- **Message** (out): the message.

Tip: Read messages in a Loop, and use a Switch on **Received** so the program only acts on new messages.`,
      },
      {
        id: 'block-my-block',
        title: 'My Block',
        body: `A block you made yourself from other blocks (Edit → **Make a new My Block**). It does what the blocks inside it do, and its plugs come from the My Block parameters inside it.

Double-click it to open it in its own tab. Changing it there changes every copy. Find your My Blocks in the **My Blocks** palette.

See [[My Blocks: your own blocks|#myblocks]] and [[My Block parameter|#block-my-block-param]].`,
      },
    ],
  },
];

/**
 * The reference section for each palette entry (palette key → section id), and for
 * blocks that aren't in the palette under their own key.
 */
export const BLOCK_SECTIONS: Record<string, string> = {
  move: 'block-move',
  motor: 'block-motor',
  sound: 'block-sound',
  display: 'block-display',
  'color-lamp': 'block-color-lamp',
  'sensor-touch': 'block-touch',
  'sensor-light': 'block-light',
  'sensor-sound': 'block-sound-sensor',
  'sensor-ultrasonic': 'block-ultrasonic',
  'sensor-color': 'block-color-sensor',
  'sensor-rotation': 'block-rotation',
  'sensor-timer': 'block-timer',
  'sensor-button': 'block-buttons',
  'reset-rotation': 'block-reset-rotation',
  'reset-timer': 'block-reset-timer',
  'wait-time': 'block-wait',
  'wait-touch': 'block-wait',
  'wait-light': 'block-wait',
  'wait-sound': 'block-wait',
  'wait-ultrasonic': 'block-wait',
  'wait-color': 'block-wait',
  'wait-rotation': 'block-wait',
  'wait-timer': 'block-wait',
  'wait-button': 'block-wait',
  loop: 'block-loop',
  switch: 'block-switch',
  stop: 'block-stop',
  logic: 'block-logic',
  math: 'block-math',
  compare: 'block-compare',
  range: 'block-range',
  random: 'block-random',
  variable: 'block-variable',
  constant: 'block-constant',
  'my-block-param': 'block-my-block-param',
  'number-to-text': 'block-number-to-text',
  text: 'block-text',
  'file-access': 'block-file',
  'send-message': 'block-send-message',
  'receive-message': 'block-receive-message',
  'my-block': 'block-my-block',
};
