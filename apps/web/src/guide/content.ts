/**
 * The user guide (Help → User guide, F1).
 *
 * Section text is light markup, read by `GuideText`:
 * - paragraphs are separated by blank lines;
 * - a paragraph whose lines all start with "- " is a bullet list, "1. " a numbered list;
 * - a paragraph starting "Tip:", "Note:" or "Warning:" is a callout box;
 * - `**bold**`, `` `keys or names` `` and `[[label|target]]` links. A target starting
 *   with "#" goes to another section; anything else is an action the app runs (see
 *   `GUIDE_ACTIONS`).
 */

export interface GuideSection {
  id: string;
  title: string;
  body: string;
}

export interface GuideChapter {
  id: string;
  title: string;
  icon: string;
  sections: GuideSection[];
}

/** Actions a guide link can run, with what the button does. */
export const GUIDE_ACTIONS = {
  tutorials: 'Open the tutorials',
  gallery: 'Open the example gallery',
  shortcuts: 'Show the keyboard shortcuts',
  simulate: 'Run in the simulator',
  connect: 'Connect via USB',
  udev: 'Download the Linux USB rule (70-nxt.rules)',
  udevSetup: 'Open Linux USB setup',
  nxt: 'Open the NXT window',
  files: 'Open the files on the brick',
  screen: 'Show the brick’s screen',
  remote: 'Open remote control',
  health: 'Open the health check',
  datalog: 'Open data logging',
  picture: 'Open the picture editor',
  recorder: 'Open the sound recorder',
  gif: 'Open Animation from GIF',
  checker: 'Check the program',
  calculator: 'Open the calculator',
  robot: 'Open robot setup',
  challenges: 'Open the challenges',
  library: 'Open the program library',
  history: 'Open the history',
  snippets: 'Open the snippets',
  share: 'Make a share link',
  palette: 'Open the command palette',
  variables: 'Define variables',
} as const;

export type GuideAction = keyof typeof GUIDE_ACTIONS;

export const GUIDE: GuideChapter[] = [
  {
    id: 'start',
    title: 'Getting started',
    icon: 'flag_green',
    sections: [
      {
        id: 'welcome',
        title: 'What NXT Web Studio is',
        body: `NXT Web Studio lets you program a MINDSTORMS NXT robot in the browser, the way the original NXT 2.0 software did: blocks on a beam, settings at the bottom and a controller to send the program to the brick.

- No install: everything runs in the browser, and your programs stay on this computer.
- No brick needed to start: the **simulator** runs your program on a virtual robot.
- With a brick on USB, the program goes onto it in a second or two.
- It opens programs made with the original software (\`.rbt\` and \`.rbtx\`).

Note: NXT Web Studio is an independent project. It is not made by or connected to the LEGO Group.`,
      },
      {
        id: 'browser',
        title: 'Which browser to use',
        body: `Use a current **Chrome**, **Edge**, **Brave** or **Opera**. These can talk to USB devices (WebUSB), which is how the program reaches the brick.

Firefox and Safari can't talk to USB devices. In them you can still write programs, use the simulator, and save the compiled \`.rxe\` file to copy over some other way.

Tested on Linux and macOS. Linux needs a one-time permission rule first: see [[Setting up on Linux|#linux]].`,
      },
      {
        id: 'layout',
        title: 'The window at a glance',
        body: `- **Menu bar** at the top: File, Edit, View, Tools, Simulator and Help.
- **Toolbar** below it: the most-used commands, the connection state, and the brick's battery when a brick is connected.
- **Program tabs**: one tab per open program.
- **Palette** on the left: the blocks. The tabs at its bottom switch between Common, Complete, My Blocks and your favourites (♥).
- **Canvas** in the middle: the sequence beam with your program.
- **Configuration panel** at the bottom: the settings of the selected block.
- **Little Help** next to it: what the selected block does, tips, and examples that use it.
- **Controller** at the bottom right: NXT window, Download and run, Download, Stop, and Simulate.`,
      },
      {
        id: 'first',
        title: 'Your first program in five minutes',
        body: `1. Drag a **Move** block from the palette onto the beam.
2. In the configuration panel, set Duration to 2 rotations.
3. Press [[F5|simulate]] (or the Simulate button) to watch the virtual robot drive.
4. Add a second Move block, set Steering all the way to one side, and run it again: the robot turns.
5. With a brick on USB, click **Download and run** on the controller.

Tip: The [[tutorials|tutorials]] walk you through this and more, and tick each step off by themselves when you get it right.`,
      },
      {
        id: 'learn',
        title: 'Ways to learn',
        body: `- **Tutorials** (Help → Tutorials): step-by-step lessons that check your program as you go.
- **Example gallery** (Help → Example gallery): ready-made programs such as a line follower, a sumo robot and a stopwatch. Open one, read it, run it in the simulator, change it.
- **Little Help**: select any block to see what it does, with tips and links to examples that use it.
- **Challenges** (Simulator → Challenges): small missions on the simulator mats, with a timer and stars.

[[Open the tutorials|tutorials]] · [[Open the example gallery|gallery]]`,
      },
    ],
  },
  {
    id: 'setup',
    title: 'Setting up the brick',
    icon: 'connect',
    sections: [
      {
        id: 'firmware',
        title: 'What the brick needs',
        body: `The brick needs its **standard firmware**, the one it comes with from the factory. Programs are compiled to \`.rxe\` files, the same kind the original software makes, so nothing on the brick needs changing.

Use fresh batteries or a charged battery pack. With a weak battery, motors are slower and sensors less reliable, so programs behave differently from the simulator. NXT Web Studio warns you before a download when the battery is below 6.8 V.`,
      },
      {
        id: 'usb',
        title: 'Connecting with USB',
        body: `1. Switch the brick on and plug it into the computer with its USB cable.
2. Click **Connect** on the controller or in the toolbar, or use Tools → Connect via USB.
3. The browser shows a list of devices: pick the NXT and click Connect.

After the first time, the browser remembers the brick. The toolbar then shows its name and battery level.

Only one program can use the brick at a time. If another browser tab, the original software or another tool has it open, connecting fails with "The brick is busy".

[[Connect via USB|connect]]`,
      },
      {
        id: 'linux',
        title: 'Setting up on Linux',
        body: `On Linux the browser isn't allowed to open USB devices until a **udev rule** says it may. You need to do this once per computer.

1. [[Download 70-nxt.rules|udev]] (it's also in the Help menu). It's a one-line text file.
2. In a terminal, run (it asks for your password):
   \`sudo cp ~/Downloads/70-nxt.rules /etc/udev/rules.d/\`
   \`sudo udevadm control --reload-rules\`
   \`sudo udevadm trigger\`
3. Unplug the brick and plug it in again.

Note: Keep the number at the start of the file name below 73. A rule called \`99-nxt.rules\` is read too late and has no effect.

If your system doesn't use systemd-logind, change \`TAG+="uaccess"\` in the rule to \`GROUP="plugdev"\` and add yourself to the plugdev group.

[[Open Linux USB setup|udevSetup]]: it has a button that copies the commands.`,
      },
      {
        id: 'macos',
        title: 'Setting up on macOS',
        body: `macOS needs no setup. Plug the brick in and click Connect.

If the original MINDSTORMS software is installed and running, quit it first, because it holds on to the brick.`,
      },
      {
        id: 'bluetooth',
        title: 'Bluetooth (experimental)',
        body: `The brick can also be reached over Bluetooth, through the browser's serial-port support (Chrome, Edge or Chromium 117 or newer):

1. Switch on Bluetooth on the brick (Bluetooth menu → On/Off, Visibility on).
2. Pair the brick with your computer in the system's Bluetooth settings. The brick asks for a passkey; the default is \`1234\`. Confirm it on the brick with the orange button and type the same passkey on the computer.
3. In NXT Web Studio, choose Tools → **Connect via Bluetooth (experimental)** and pick the brick in the list.

The list shows only paired Bluetooth devices that offer a serial port, not the computer's own serial ports.

Bluetooth is much slower than USB, so downloads and the live views take longer. If it doesn't work, use USB.`,
      },
      {
        id: 'bluetooth-linux',
        title: 'Pairing on Linux',
        body: `The brick uses old-style PIN pairing, which some desktop pairing wizards (KDE's, for example) fail at. Pair it from a terminal instead:

1. Switch on the brick's Bluetooth with Visibility on.
2. Open a terminal and run \`bluetoothctl\`. Then type, one line at a time:
    \`agent KeyboardOnly\`
    \`default-agent\`
    \`scan on\`
3. Wait until a line with **NXT** and its address appears (it starts with \`00:16:53\`), then type \`scan off\`.
4. Type \`pair\` followed by that address, for example \`pair 00:16:53:0F:32:D7\`.
5. The brick shows a passkey: press the orange button to accept \`1234\`. When the terminal asks **Enter PIN code**, type \`1234\` and press Enter.
6. Type \`trust\` and the same address, then \`quit\`.

Note: if the brick doesn't show up in **Connect via Bluetooth**, bind it to a serial port yourself and pick that port with Tools → **Connect via other serial port…**: \`sudo rfcomm bind 0\` plus the brick's address creates \`/dev/rfcomm0\`. On Arch the \`rfcomm\` tool is in the \`bluez-deprecated-tools\` package, and your user needs to be in the group that owns the port (\`uucp\` on Arch, \`dialout\` on Debian and Ubuntu).`,
      },
      {
        id: 'offline',
        title: 'Installing it as an app and working offline',
        body: `Once the page has loaded, NXT Web Studio also works without an internet connection. In Chrome or Edge you can install it as an app (the install icon in the address bar): it then opens in its own window, like a normal program.

Your programs, pictures and sounds are kept in this browser's storage, so they're still there next time, also offline.`,
      },
    ],
  },
  {
    id: 'editor',
    title: 'Writing programs',
    icon: 'bricks',
    sections: [
      {
        id: 'blocks',
        title: 'Placing and moving blocks',
        body: `- Drag a block from the palette onto the beam. A gap opens where it will go.
- Drag blocks on the beam to move them, or select one and press \`Alt+←\` / \`Alt+→\`.
- Click to select; \`Ctrl\`+click or drag a box around blocks to select several.
- \`Delete\` removes the selection. \`Ctrl+Z\` undoes anything.
- Press \`I\` to insert a block by typing its name, after the selected block.

Palettes: **Common** has the everyday blocks, **Complete** has all of them in groups, **My Blocks** has the blocks you made yourself, and **♥** has your favourites and recently used blocks. Right-click a block in the palette to add it to your favourites.`,
      },
      {
        id: 'config',
        title: 'Changing a block’s settings',
        body: `Select a block to see its settings in the configuration panel at the bottom: ports, power, duration, sensor thresholds and so on. Changes apply straight away.

The icons and text on the block itself also show the main settings, so you can read a program without clicking every block.

Display and Sound blocks offer a list of the pictures and sounds you have, and the Display block shows a preview of the picture it will draw.`,
      },
      {
        id: 'flow',
        title: 'Loops, switches and waits',
        body: `- **Wait** pauses the beam until something happens: a time, a touch, a distance, a colour, a button, a sound.
- **Loop** repeats the blocks inside it: forever, a number of times, for a time, or until a sensor says so.
- **Switch** has two beams and runs one of them, depending on a sensor or a wired value.

Drop blocks inside a Loop or Switch to put them on its inner beam. Loops and switches grow to fit what's in them.`,
      },
      {
        id: 'parallel',
        title: 'Parallel beams: doing two things at once',
        body: `A parallel beam runs at the same time as the main beam, for example to play music while driving, or to watch a touch sensor while the robot follows a line.

Click the **+** under the start of the beam, or drag the beam's start node downwards. Each beam runs on its own; a Wait on one beam doesn't stop the others.

Warning: Don't drive the same motor from two beams at once: they will fight over it. The program checker warns about this.`,
      },
      {
        id: 'data',
        title: 'Data hubs and wires',
        body: `Blocks can pass values to each other along **data wires**: a distance into a Display block, a random number into the power of a Move block, a comparison into a Switch.

1. Fold out a block's **data hub** with the small tab at the bottom of the block.
2. Drag from an output plug (right side) to an input plug (left side) of another block's hub.

Or select a block and press \`W\` to pick both ends from a list.

Wire colours show the kind of value: yellow for numbers, green for yes/no (logic) and orange for text. Plugs only connect to plugs of the same kind; hover over a plug to see what it takes. Click a wire to select it, and press Delete to remove it.

While the simulator runs, each wire shows the value going through it.`,
      },
      {
        id: 'variables',
        title: 'Variables',
        body: `A variable keeps a number, a yes/no value or a piece of text while the program runs. Use Edit → **Define variables** to make one, then use the **Variable** block to write it in one place and read it in another, even on another beam.

The simulator lists each variable's value while it runs.

[[Define variables|variables]]`,
      },
      {
        id: 'myblocks',
        title: 'My Blocks: your own blocks',
        body: `When a group of blocks does one job (such as "turn left 90 degrees"), make it into a My Block: select the blocks and choose Edit → **Make a new My Block**. The blocks are replaced by a single block, which you find in the **My Blocks** palette.

Double-click a My Block to open it in its own tab. Changing it there changes every copy in the program.`,
      },
      {
        id: 'comments',
        title: 'Comments',
        body: `Edit → **Add comment** puts a note on the canvas. Use notes to explain what part of the program does; drag them by their edge, and they never affect the program.`,
      },
      {
        id: 'views',
        title: 'Views: modern blocks, wires and the Work Map',
        body: `- View → **Modern blocks (Blockly)** shows the same program as puzzle-piece blocks, which some people find easier to read. Switch back at any time: both views edit the same program.
- View → **Classic wires** draws data wires with right angles, as in the original software, instead of curves.
- View → **Work Map** shows a small overview of the whole program; click it to jump there.
- View → **Program outline** shows the program as indented text, handy for reading or printing.
- View → Theme: Light, Dark or Same as the system.`,
      },
    ],
  },
  {
    id: 'programs',
    title: 'Saving, opening and sharing',
    icon: 'diskette',
    sections: [
      {
        id: 'tabs',
        title: 'Several programs at once',
        body: `Every program you open gets its own tab above the canvas, with its own undo history and zoom.

- **+** starts a new program; **×** or a middle-click closes a tab.
- Double-click a tab to rename the program.
- A **\\*** after the name means there are changes you haven't saved to a file.
- When you reload the page, your open tabs come back.

Program names on the brick can be at most 15 characters, so the name is cut off there.`,
      },
      {
        id: 'files',
        title: 'Saving and opening files',
        body: `File → **Save** (\`Ctrl+S\`) saves the program as a \`.nxtproj\` file on your computer. File → **Open** (\`Ctrl+O\`) opens \`.nxtproj\` files and programs from the original NXT-G software (\`.rbt\`, and \`.rbtx\` Pack and Go files with their My Blocks).

File → **Save back to NXT-G** writes the settings you changed back into the \`.rbt\` you opened, so the original software can open it again. It only handles changed settings of the common blocks: adding, deleting or moving blocks, or changing wires, beams and variables, can't be written back yet, and it tells you so.

Note: Some \`.rbt\` programs use blocks that NXT Web Studio doesn't have yet. Those blocks are left out, and a message after opening lists them.`,
      },
      {
        id: 'library',
        title: 'The program library and history',
        body: `You don't have to save to a file to keep your work. Every program you work on is kept in the **program library** inside this browser (File → Program library), where you can search, rename, duplicate and delete them.

Edit → **History** keeps earlier versions: every five minutes while you're making changes, and each time you save to a file. Open an older version if something went wrong.

Warning: The library lives in this browser only. Clearing the browser's site data deletes it, and other browsers or computers don't see it. Save important programs to a file as well.

[[Open the program library|library]] · [[Open the history|history]]`,
      },
      {
        id: 'share',
        title: 'Share links',
        body: `File → **Share link** makes a link that contains the whole program. Whoever opens it gets the program as a new tab, without anything being uploaded anywhere.

Pictures and sounds the program uses are not in the link: send those files separately, or let the other person make their own.

[[Make a share link|share]]`,
      },
      {
        id: 'export',
        title: 'Pictures of your program',
        body: `File → **Export as picture** saves the program as a PNG (for documents and slides) or SVG (sharp at any size). The picture is cropped around the blocks.

This works in the classic view; switch off Modern blocks first.`,
      },
      {
        id: 'snippets',
        title: 'Snippets',
        body: `Select some blocks and choose Edit → **Save selection as snippet** to keep them for later. Edit → **Snippets** inserts one into any program. Handy for pieces you use often, such as a calibrated turn.

[[Open the snippets|snippets]]`,
      },
    ],
  },
  {
    id: 'sim',
    title: 'The simulator',
    icon: 'car',
    sections: [
      {
        id: 'run',
        title: 'Running a program',
        body: `Press **F5** or click **Simulate** on the controller. The simulator window shows a robot on a mat, the brick's screen and its buttons.

- **Pause**, **Step** (run until the next block starts) and **Stop and reset** are in the simulator's toolbar.
- The speed list runs it slower or faster than real time.
- While it runs, the block that is running lights up, and data wires show their values.
- Press the brick's buttons with the mouse, or with \`←\` \`Enter\` \`→\` while the simulator has focus.
- The microphone slider sets what the sound sensor hears.

If you change the program while it runs, the simulator says so: press Stop and reset to use the new version.

[[Run in the simulator|simulate]]`,
      },
      {
        id: 'debug',
        title: 'Finding bugs: breakpoints and stepping',
        body: `Select a block and press **F9** to put a breakpoint on it (a red dot). The simulator pauses as soon as that block starts. Then:

- look at the variables list and the values on the wires;
- press **Step** to run one block at a time;
- press Continue to run on to the next breakpoint.

Press F9 again on the block to remove the breakpoint.`,
      },
      {
        id: 'mats',
        title: 'Mats',
        body: `Pick a mat from the list in the simulator's toolbar: an empty table, a driving square, a line-follow oval, an obstacle room, a colour race, a sumo ring and barcode cards.

Choose **New mat…** or click the pencil to draw your own, with lines, colours and walls. You can also start from a photo of a real mat. Your mats are kept in the browser.`,
      },
      {
        id: 'robot',
        title: 'Robot setup',
        body: `The simulator needs to know how your robot is built to match the real one: which motors drive the wheels, the wheel size, the distance between the wheels, and where each sensor sits.

Tools → **Robot setup** sets this. The distance and turn calculator uses the same numbers, so set it up once and both agree with your robot.

[[Open robot setup|robot]]`,
      },
      {
        id: 'challenges',
        title: 'Challenges',
        body: `Simulator → **Challenges** gives you small missions, such as parking in a box, stopping on red, or one lap around the oval. Each has a timer and up to three stars; your best score is remembered.

[[Open the challenges|challenges]]`,
      },
      {
        id: 'two',
        title: 'Two robots and Bluetooth messages',
        body: `Under **Bluetooth messages** in the simulator, pick a **second brick**: this program, an example, or a program from your library. Both robots then drive on the same mat and can bump into each other.

Brick 1 is the master. It sends to brick 2 on connection 1, and brick 2 answers on connection 0. Use the same mailbox number on both sides.

You can also type a message and send it into a mailbox yourself, to test a program that waits for one.`,
      },
      {
        id: 'record',
        title: 'Recording a GIF',
        body: `The record button in the simulator's toolbar captures the mat and the screen as an animated GIF, up to 30 seconds. Press it again to stop and save. Good for showing off a solution or asking for help.`,
      },
      {
        id: 'differences',
        title: 'How the simulator differs from a real robot',
        body: `The simulator is close, but not exact:

- Real motors slip, wobble and slow down as the battery runs low.
- Real light and colour sensors depend on the room's light and the height of the sensor.
- The ultrasonic sensor can miss soft or angled objects that the simulator does see.

Tip: Use the simulator to get the logic right, then fine-tune numbers such as turn degrees and thresholds on the real robot.`,
      },
    ],
  },
  {
    id: 'brick',
    title: 'Working with the brick',
    icon: 'brick',
    sections: [
      {
        id: 'download',
        title: 'Download, run and stop',
        body: `The controller at the bottom right:

- **Download and run** sends the program and starts it right away.
- **Download** only sends it. Start it on the brick from My Files → Software files.
- **Stop** stops whatever runs on the brick.

Before sending, the program is checked: blocks with a red mark must be fixed first.

Pictures and sounds the program uses are sent along when they're missing on the brick, as long as this browser has them (because you made or uploaded them here). The message after the download lists what was sent and what is missing.

Without a brick, Download offers to save the \`.rxe\` file instead.`,
      },
      {
        id: 'nxtwindow',
        title: 'The NXT window',
        body: `Click the NXT window button on the controller, or Tools → NXT Window. Its tabs:

- **Communications**: connect or disconnect, rename the brick, and see its battery and free flash memory.
- **Files**: what's on the brick (see below).
- **Monitor**: live readings of all sensors and motors; set a sensor type per port and try the motors.
- **Screen**: a live copy of the brick's screen, with **Record GIF**.
- **Remote control**: drive the robot with the arrow keys or WASD, the on-screen pad or the joystick area. Also works on the simulated robot.
- **Health check**: battery, firmware, free memory, and quick tests of each motor and sensor port.`,
      },
      {
        id: 'brickfiles',
        title: 'Files on the brick',
        body: `The Files tab lists everything on the brick: programs (\`.rxe\`), sounds (\`.rso\`), pictures (\`.ric\`) and other files.

- **Upload**: sounds (WAV, MP3, OGG…) become \`.rso\` and pictures become \`.ric\` automatically.
- Click a file to preview it; download it to your computer to keep a copy.
- Tick several files and press Delete: they are removed one at a time, and Stop halts the queue.
- **Tick unused** ticks the pictures and sounds that none of the programs in this browser use, so you can free space quickly. It never ticks the brick's built-in \`!\` sounds.

Warning: The brick's built-in demo programs may use some pictures and sounds that Tick unused selects. Check the ticks before you delete.

[[Open the files on the brick|files]]`,
      },
      {
        id: 'datalog',
        title: 'Data logging',
        body: `Tools → **Data logging** records sensor readings over time and draws them as a graph, from the brick or the simulator. Save the readings as a file for a spreadsheet. Good for experiments: how fast does the robot go, how light is each colour?

[[Open data logging|datalog]]`,
      },
      {
        id: 'calibrate',
        title: 'Calibrating a sensor',
        body: `Select a Wait, Loop, Switch or sensor block that uses the light, sound, ultrasonic or colour (light mode) sensor, then choose Tools → **Calibrate sensor**. Take a reading of each of the two situations (light and dark, quiet and loud, near and far), and it sets the threshold halfway between them. It works with the brick or the simulated robot.`,
      },
      {
        id: 'capture',
        title: 'Recording USB traffic',
        body: `Tools → **Record USB traffic** logs everything sent to and from the brick until you stop it, then saves it as a file with your note on what you did. Attach it when you report a problem with the brick connection.`,
      },
    ],
  },
  {
    id: 'media',
    title: 'Pictures, sounds and animations',
    icon: 'picture',
    sections: [
      {
        id: 'picture',
        title: 'The picture editor',
        body: `Tools → **Picture editor** draws pictures for the brick's screen (100 × 64 pixels, black and white): pencil, eraser, line, rectangles, ellipses, fill and text, plus flipping and undo. You can also open a photo or drawing, which is turned into black and white.

Save it to the brick, or as a \`.ric\` file. The Display block's picture list then offers it.

[[Open the picture editor|picture]]`,
      },
      {
        id: 'sound',
        title: 'The sound recorder',
        body: `Tools → **Sound recorder** records from your microphone, or turns a sound file (WAV, MP3, OGG) into an \`.rso\` file for the brick. Recordings are at most 5 seconds.

8 kHz sounds best on the brick's speaker and uses the least memory: about 8 KB per second. Keep sounds short; the brick has little room.

[[Open the sound recorder|recorder]]`,
      },
      {
        id: 'gif',
        title: 'Animations from a GIF',
        body: `Tools → **Animation from GIF** turns an animated GIF into a series of pictures for the brick's screen:

1. Open a GIF. Choose the size (whole screen, half or small) and the black-and-white threshold.
2. Click frames to leave them out; fewer frames means less memory.
3. Send the frames to the brick, or save them as a zip.
4. **Make a program** opens a new program that shows the frames one after the other.

The frames are sent along automatically when you download that program.

[[Open Animation from GIF|gif]]`,
      },
      {
        id: 'memory',
        title: 'Keeping an eye on memory',
        body: `The brick has little room for your own files: its flash memory is shared with the firmware. A full-screen picture takes about 800 bytes, a second of sound about 8 KB.

The Health check and Communications tabs show the free memory. If a download fails for lack of room, delete old programs, pictures and sounds from the Files tab (Tick unused helps).`,
      },
    ],
  },
  {
    id: 'helpers',
    title: 'Editor helpers',
    icon: 'wand',
    sections: [
      {
        id: 'palette',
        title: 'Command palette',
        body: `Press **Ctrl+K** and type: any menu command, block, example, tutorial or challenge. Faster than hunting through menus, once you know what you want.

[[Open the command palette|palette]]`,
      },
      {
        id: 'checker',
        title: 'Checking the program',
        body: `Tools → **Check program** lists problems and tips: unconnected wires, motors used on two beams at once, unused variables, missing settings. Click a line to go to the block. Blocks with a problem also get a mark on the canvas, and Little Help lists the problems with the selected block.

[[Check the program|checker]]`,
      },
      {
        id: 'tidy',
        title: 'Tidy up',
        body: `Edit → **Tidy up** cleans the program: it removes empty parallel beams, broken wires and unused variables, folds in data hubs that have no wires, and moves comments off the blocks they cover. It tells you what it changed, and Undo puts it back.`,
      },
      {
        id: 'calculator',
        title: 'Distance and turn calculator',
        body: `Tools → **Distance and turn calculator** works out the degrees for a distance (say 30 cm) or a turn (say 90°), from your wheel size and track width. With a Move block selected, **Use in Move** puts the result straight into it.

[[Open the calculator|calculator]]`,
      },
      {
        id: 'find',
        title: 'Finding things',
        body: `Edit → **Find** (\`Ctrl+F\`) finds blocks by name or setting (texts, file names, numbers), variables and comments, and jumps to them, also inside loops, switches, parallel beams and My Blocks.`,
      },
    ],
  },
  {
    id: 'tips',
    title: 'Tips and tricks',
    icon: 'lightbulb',
    sections: [
      {
        id: 'driving',
        title: 'Driving',
        body: `- Steering 0 drives straight, ±100 spins on the spot, ±50 turns around one wheel.
- For exact turns, use degrees, not seconds: time depends on the battery, degrees don't.
- Set the motors to **Brake** at the end of a move for an exact stop; **Coast** for a smooth one.
- Lower power gives more accurate distances; motors overshoot at full speed.
- Put a short Wait between moves if the robot rocks after stopping.`,
      },
      {
        id: 'sensors',
        title: 'Sensors',
        body: `- Calibrate light thresholds in the room where the robot will run (Tools → Calibrate sensor).
- A line follower works better with a lower speed and a Switch inside a forever Loop.
- The ultrasonic sensor sees best straight ahead at hard, flat objects; it can miss soft or angled ones.
- Check sensors live in NXT window → Monitor before blaming the program.
- The colour sensor (NXT 2.0 set) can also be a lamp: the Color Lamp block lights it red, green or blue.`,
      },
      {
        id: 'screen',
        title: 'Using the screen',
        body: `- A program that ends goes straight back to the brick's menu, so what it drew vanishes. End with a Wait (time or button) to keep it on screen.
- To show a number, use **Number to text** and wire it into a Display block.
- Text lines 1–8 are 8 pixels high; untick Clear to draw several things on top of each other.`,
      },
      {
        id: 'editing',
        title: 'Editing faster',
        body: `- Press \`I\` to insert a block by typing, \`W\` to wire, \`Ctrl+D\` to duplicate.
- Right-click blocks you use often in the palette and add them to your favourites.
- Copy and paste work between program tabs.
- Zoom with \`Ctrl++\` and \`Ctrl+-\`; the Work Map helps in big programs.
- Name variables and My Blocks after what they mean ("Turns", "Turn left"), not "Number 1".

[[Show the keyboard shortcuts|shortcuts]]`,
      },
      {
        id: 'habits',
        title: 'Good habits',
        body: `- Build a little, test a little: run in the simulator after each few blocks.
- Use My Blocks for every move you repeat; fix it once and every copy is right.
- Save to a file before big changes, or rely on Edit → History.
- Keep a share link of a working version before you start experimenting.`,
      },
    ],
  },
  {
    id: 'trouble',
    title: 'Troubleshooting',
    icon: 'error',
    sections: [
      {
        id: 'connect-buttons',
        title: 'The Connect button is greyed out',
        body: `Your browser can't talk to USB devices. Use Chrome, Edge, Brave or Opera. The Bluetooth button needs the browser's serial-port support, which the same browsers have on desktop computers.`,
      },
      {
        id: 'not-listed',
        title: 'The brick isn’t in the list when connecting',
        body: `- Check that the brick is switched on (the screen shows the menu) and that the cable is in all the way. Try another cable or USB port.
- The brick goes to sleep after a while; press its orange button.
- If the brick only ticks and its screen stays empty, its firmware is broken: reinstall the firmware with the original software, then try again.`,
      },
      {
        id: 'permission',
        title: '"Permission denied"',
        body: `On Linux, the udev rule isn't installed or isn't active yet. [[Download it|udev]] if you haven't (see [[Linux USB setup|udevSetup]]). Check that it is in \`/etc/udev/rules.d/\`, that the name ends in \`.rules\` and starts with a number below 73, then reload the rules and replug the brick. See [[Setting up on Linux|#linux]].`,
      },
      {
        id: 'busy',
        title: '"The brick is busy"',
        body: `Something else has the brick open: another NXT Web Studio tab, the original MINDSTORMS software, or another tool. Close it (or click Disconnect in the other tab), then connect again. Unplugging and replugging the brick also helps.`,
      },
      {
        id: 'no-answer',
        title: '"The brick did not answer"',
        body: `The brick went to sleep, was switched off, or its batteries are empty. Wake it up, check the batteries, and connect again. Over Bluetooth, move closer to the computer.`,
      },
      {
        id: 'cannot-download',
        title: '"Cannot download"',
        body: `The program has a problem the brick can't run: a broken wire, a missing setting, a block that isn't supported. The message names it, and the block gets a red mark. Fix it, or check the whole program with Tools → Check program.`,
      },
      {
        id: 'nothing-happens',
        title: 'The program runs but nothing happens',
        body: `- Check the ports: is the motor really on B and C, the sensor really on port 4? NXT window → Monitor shows what is plugged in.
- The program may end straight away: anything it shows disappears unless you end with a Wait.
- Batteries: a weak battery can be too weak to turn the motors under load.`,
      },
      {
        id: 'blank-picture',
        title: 'Pictures or sounds don’t show or play',
        body: `The file is probably not on the brick. After a download, the message lists anything that was missing. Make the picture or sound in this browser (or upload it in Files), then download the program again; it sends the files along.

Also check the file name in the Display or Sound block matches the file on the brick exactly.`,
      },
      {
        id: 'different',
        title: 'The robot does something different from the simulator',
        body: `- Set up the simulator to match your robot (Tools → Robot setup): wheel size and track width matter for turns.
- Calibrate light and colour thresholds on the real mat.
- Check the battery; the toolbar shows it in red when it is low.
See also [[How the simulator differs|#differences]].`,
      },
      {
        id: 'full',
        title: 'The brick is full',
        body: `Delete files you don't need in NXT window → Files. **Tick unused** finds pictures and sounds that no program here uses. Shorter sounds and smaller animations save the most.`,
      },
      {
        id: 'lost',
        title: 'My program is gone',
        body: `- Look in File → **Program library**: everything you worked on in this browser is there.
- Edit → **History** has earlier versions.
- Programs are kept per browser: did you use another browser, a private window, or another computer?`,
      },
      {
        id: 'rbt',
        title: 'An .rbt program doesn’t open properly',
        body: `Programs from the original software open as closely as possible, but some blocks (for example from add-on sensors) aren't supported yet: they are left out, and the message after opening lists them. A program that uses My Blocks opens completely only as an \`.rbtx\` (Pack and Go) file, because a plain \`.rbt\` doesn't contain them.`,
      },
      {
        id: 'report',
        title: 'Reporting a problem',
        body: `Say what you did, what you expected and what happened. Include the program (a share link is easiest) and, for brick problems, a recording from Tools → Record USB traffic.`,
      },
    ],
  },
  {
    id: 'notes',
    title: 'Things to know',
    icon: 'information',
    sections: [
      {
        id: 'limits',
        title: 'Limits of the brick',
        body: `- Program names: up to 15 characters. File names on the brick: up to 15 characters plus the extension.
- Screen: 100 × 64 pixels, black and white.
- Sounds: 8-bit; keep them short (8 KB per second at 8 kHz).
- Memory: little room for files; the Health check shows how much is free.
- Bluetooth mailboxes 1–10, five messages each.`,
      },
      {
        id: 'privacy',
        title: 'Your data',
        body: `Everything stays in your browser: programs, pictures, sounds, mats and settings. Nothing is uploaded. A share link holds the program itself, so anyone with the link can read it.`,
      },
      {
        id: 'sensors-kits',
        title: 'Kits and sensors',
        body: `NXT Web Studio supports the sensors from the NXT 1.0 and 2.0 sets: touch, light, sound, ultrasonic and the colour sensor, plus the motors' rotation sensors, timers and the brick's buttons. The colour sensor needs a brick with the NXT 2.0 firmware.`,
      },
      {
        id: 'credits',
        title: 'Credits',
        body: `Open source under the MIT licence. Icons: FatCow Farm-Fresh Web Icons (CC BY 3.0). See Help → About. LEGO and MINDSTORMS are trademarks of the LEGO Group, which doesn't sponsor or endorse this project.`,
      },
    ],
  },
];

/** A section with its chapter, for search results. */
export interface GuideHit {
  chapter: GuideChapter;
  section: GuideSection;
}

/** Plain text of guide markup (for searching). */
export function plainText(body: string): string {
  return body
    .replace(/\[\[([^|\]]+)\|[^\]]+\]\]/g, '$1')
    .replace(/\*\*|`/g, '')
    .toLowerCase();
}

/** Sections whose title or text contains every word of `query`; title matches first. */
export function searchGuide(query: string, guide: GuideChapter[] = GUIDE): GuideHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: (GuideHit & { score: number })[] = [];
  for (const chapter of guide) {
    for (const section of chapter.sections) {
      const title = section.title.toLowerCase();
      const text = `${title} ${plainText(section.body)}`;
      if (!words.every((w) => text.includes(w))) continue;
      hits.push({ chapter, section, score: words.filter((w) => title.includes(w)).length });
    }
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** The chapter that holds a section id. */
export function chapterOf(sectionId: string, guide: GuideChapter[] = GUIDE): GuideChapter | null {
  return guide.find((c) => c.sections.some((s) => s.id === sectionId)) ?? null;
}
