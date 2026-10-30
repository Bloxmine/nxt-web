import { walkProgram, type Block, type Condition, type Program } from '@nxt/blocks';
import type { Simulation } from '@nxt/sim';

/** What a step's check can look at. */
export interface StepContext {
  program: Program;
  /** The current simulation, if the simulator was used. */
  sim: Simulation | null;
}

/** One step of a tutorial. */
export interface TutorialStep {
  title: string;
  /** Instructions; blank lines separate paragraphs, `**bold**` is supported. */
  text: string;
  hint?: string;
  /** True once the step is done. Steps without a check are read-and-continue. */
  check?: (ctx: StepContext) => boolean;
  /** Mat the simulator should use for this step. */
  mat?: string;
}

export interface Tutorial {
  key: string;
  title: string;
  summary: string;
  level: 'beginner' | 'intermediate';
  steps: TutorialStep[];
}

// ---- Helpers for checks --------------------------------------------------

/** Every block of a kind, anywhere in the program. */
export function blocksOf<K extends Block['kind']>(
  p: Program,
  kind: K,
): Extract<Block, { kind: K }>[] {
  const out: Extract<Block, { kind: K }>[] = [];
  walkProgram(p, (b) => {
    if (b.kind === kind) out.push(b as Extract<Block, { kind: K }>);
  });
  return out;
}

const conditionOfBlock = (b: Block): Condition | null =>
  (b.kind === 'wait' || b.kind === 'loop') && b.control.type === 'sensor'
    ? b.control.condition
    : b.kind === 'switch' || b.kind === 'sensor'
      ? b.condition
      : null;

/** True if some block uses a sensor condition of this source. */
function usesSensor(p: Program, source: Condition['source'], kinds: Block['kind'][]): boolean {
  let found = false;
  walkProgram(p, (b) => {
    if (kinds.includes(b.kind) && conditionOfBlock(b)?.source === source) found = true;
  });
  return found;
}

/** Distance the simulated robot has moved from its start, in cm. */
const moved = (sim: Simulation | null) => {
  if (!sim) return 0;
  const s = sim.world.scenario.start;
  return Math.hypot(sim.world.pose.x - s.x, sim.world.pose.y - s.y);
};

const ran = (sim: Simulation | null) => !!sim && sim.time > 0;

// ---- Tutorials -----------------------------------------------------------

export const TUTORIALS: Tutorial[] = [
  {
    key: 'first-moves',
    title: 'First moves',
    summary: 'Make the robot drive and turn, and try it in the simulator.',
    level: 'beginner',
    steps: [
      {
        title: 'Welcome',
        text: 'Programs are made of **blocks** on a **beam**. The beam starts at the small square on the left and runs from left to right: blocks run in that order.\n\nThis tutorial uses a robot with two wheels on motors **B** and **C**. Start with an empty program (File → New).',
      },
      {
        title: 'Add a Move block',
        text: 'Drag the **Move** block (the car, at the top of the palette on the left) onto the beam.',
        hint: 'Drop it just right of the start square, where a blue line appears.',
        check: ({ program }) => blocksOf(program, 'move').length >= 1,
      },
      {
        title: 'Drive two rotations',
        text: 'Click the Move block. In the settings below the canvas, set **Duration** to **2 Rotations**.',
        hint: 'Duration is the last row of the Move block’s settings: choose "Rotations" and type 2.',
        check: ({ program }) =>
          blocksOf(program, 'move').some(
            (m) => m.duration.unit === 'rotations' && m.duration.value === 2,
          ),
      },
      {
        title: 'Try it',
        text: 'Press **Simulate** (bottom right, or F5). The simulator opens and the robot drives forward. Watch the Move block light up while it runs.',
        mat: 'empty',
        check: ({ sim }) => ran(sim) && moved(sim) > 20,
      },
      {
        title: 'Turn',
        text: 'Add a second Move block after the first. Drag its **Steering** slider all the way to the right (100): the wheels then turn in opposite directions and the robot spins. Set its duration to **230 Degrees** and simulate again.',
        hint: 'About 230 degrees of wheel rotation turn the simulated robot a quarter of a circle.',
        check: ({ program }) =>
          blocksOf(program, 'move').some(
            (m) => Math.abs(m.steering) >= 90 && m.duration.unit === 'degrees',
          ),
      },
      {
        title: 'Well done',
        text: 'You made the robot drive and turn. Next: repeat blocks with a **Loop** to drive a square (Help → Tutorials).',
      },
    ],
  },
  {
    key: 'loops',
    title: 'Loops: drive a square',
    summary: 'Repeat blocks with a Loop instead of copying them.',
    level: 'beginner',
    steps: [
      {
        title: 'One side and one turn',
        text: 'Make a program with two Move blocks: **2 rotations** straight, then a turn of **230 degrees** with steering 100 (see "First moves").',
        check: ({ program }) => {
          const moves = blocksOf(program, 'move');
          return (
            moves.some((m) => m.steering === 0 && m.duration.unit === 'rotations') &&
            moves.some((m) => Math.abs(m.steering) >= 90)
          );
        },
      },
      {
        title: 'Add a Loop',
        text: 'Drag a **Loop** (the orange arrows) onto the beam, then drag both Move blocks **into** the loop.',
        hint: 'Drop a block on the beam inside the orange frame.',
        check: ({ program }) =>
          blocksOf(program, 'loop').some(
            (l) => l.body.filter((b) => b.kind === 'move').length >= 2,
          ),
      },
      {
        title: 'Four times',
        text: 'Click the loop’s right edge and set **Control** to **Count**, **4**. A square has four sides!',
        check: ({ program }) =>
          blocksOf(program, 'loop').some(
            (l) => l.control.type === 'count' && l.control.count === 4 && l.body.length >= 2,
          ),
      },
      {
        title: 'Drive the square',
        text: 'Choose the **Driving square** mat in the simulator and press Simulate. Does the robot end where it started? If it turns too far or too little, change the turn’s degrees.',
        mat: 'square',
        check: ({ sim }) =>
          !!sim && sim.status === 'finished' && moved(sim) < 30 && sim.time > 4000,
        hint: 'The robot should be back within about 30 cm of where it started.',
      },
    ],
  },
  {
    key: 'wall',
    title: 'Sensors: stop at a wall',
    summary: 'Use the ultrasonic sensor to stop before hitting something.',
    level: 'beginner',
    steps: [
      {
        title: 'Drive forever',
        text: 'Start a new program with one Move block whose **Duration** is **Unlimited**: the motors keep running until another block changes them.',
        check: ({ program }) =>
          blocksOf(program, 'move').some((m) => m.duration.unit === 'unlimited'),
      },
      {
        title: 'Wait for the wall',
        text: 'Add a **Wait** block after it and set it to wait for the **Ultrasonic sensor** (port 4) to see something **closer than 20 cm**.',
        hint: 'Hover over the hourglass in the palette to pick "Ultrasonic", or change Control to Sensor in the Wait settings.',
        check: ({ program }) =>
          blocksOf(program, 'wait').some(
            (w) =>
              w.control.type === 'sensor' &&
              w.control.condition.source === 'ultrasonic' &&
              w.control.condition.compare === '<',
          ),
      },
      {
        title: 'Stop',
        text: 'Add one more Move block and set its **Direction** to **Stop** (the square button).',
        check: ({ program }) => blocksOf(program, 'move').some((m) => m.direction === 'stop'),
      },
      {
        title: 'Try it in the obstacle room',
        text: 'Choose the **Obstacle room** mat, drag the robot so it faces a wall, and simulate. It should stop just before the wall without touching it.',
        mat: 'walls',
        check: ({ sim }) =>
          !!sim && sim.status === 'finished' && moved(sim) > 10 && !sim.world.touching(),
      },
    ],
  },
  {
    key: 'line',
    title: 'Decisions: follow a line',
    summary: 'Use a Switch to choose what to do from the light sensor.',
    level: 'intermediate',
    steps: [
      {
        title: 'The idea',
        text: 'A line follower follows the **edge** of a dark line: on the dark side it steers one way, on the light side the other way. It does this over and over, very quickly.',
      },
      {
        title: 'Loop forever',
        text: 'Start a new program with a **Loop** set to **Forever**.',
        check: ({ program }) => blocksOf(program, 'loop').some((l) => l.control.type === 'forever'),
      },
      {
        title: 'Add a Switch',
        text: 'Put a **Switch** inside the loop and set its condition to the **Light sensor** on port 3, **less than 45**.',
        check: ({ program }) => usesSensor(program, 'light', ['switch']),
      },
      {
        title: 'Steer both ways',
        text: 'In the top branch (dark: light below 45) add a Move with **steering −40**, power 40, unlimited. In the bottom branch add a Move with **steering +40**.',
        check: ({ program }) =>
          blocksOf(program, 'switch').some(
            (s) =>
              s.whenTrue.some((b) => b.kind === 'move' && b.steering < 0) &&
              s.whenFalse.some((b) => b.kind === 'move' && b.steering > 0),
          ),
      },
      {
        title: 'Follow the oval',
        text: 'Choose the **Line-follow oval** mat and simulate. Let it run for a while: it should keep following the line.',
        mat: 'oval',
        check: ({ sim }) => !!sim && sim.time > 15000 && sim.world.trail.length > 100,
        hint: 'If it loses the line, lower the power or the steering, or change the threshold (45).',
      },
    ],
  },
  {
    key: 'wires',
    title: 'Data wires: show a reading',
    summary: 'Send a sensor value to the screen with data wires.',
    level: 'intermediate',
    steps: [
      {
        title: 'A sensor block',
        text: 'Blocks can pass values to each other along **data wires**. Start a new program and add an **Ultrasonic sensor** block (from the Complete palette, sensors).',
        check: ({ program }) =>
          blocksOf(program, 'sensor').some((s) => s.condition.source === 'ultrasonic'),
      },
      {
        title: 'Number to text',
        text: 'Add a **Number to Text** block after it, then drag from the sensor’s **Value** plug (open its hub with the little tab) to the Number plug of Number to Text.',
        check: ({ program }) => {
          const ids = new Set(blocksOf(program, 'numberToText').map((b) => b.id));
          return program.wires.some((w) => ids.has(w.to.block));
        },
      },
      {
        title: 'Show it',
        text: 'Add a **Display** block and wire the **Text** output of Number to Text into its **Text** plug.',
        check: ({ program }) => {
          const ids = new Set(blocksOf(program, 'display').map((b) => b.id));
          return program.wires.some((w) => ids.has(w.to.block) && w.to.plug === 'text');
        },
      },
      {
        title: 'Keep it updated',
        text: 'Put the three blocks in a **Loop** (forever) with a short **Wait** (0.2 s) and simulate. The simulator’s screen shows the distance, and each wire shows the value it carries.',
        mat: 'walls',
        check: ({ program, sim }) =>
          blocksOf(program, 'loop').length > 0 &&
          ran(sim) &&
          !!sim &&
          sim.lcd.pixels.some((p) => p === 1),
      },
    ],
  },
  {
    key: 'variables',
    title: 'Variables: count bumps',
    summary: 'Remember a number in a variable and show it.',
    level: 'intermediate',
    steps: [
      {
        title: 'Make a variable',
        text: 'A **variable** is a named box for a number. Choose Edit → Define variables and add a number variable called **Bumps**.',
        check: ({ program }) => program.variables.some((v) => v.name === 'Bumps'),
      },
      {
        title: 'Start at zero',
        text: 'Add a **Variable** block, choose Bumps, and set it to **0**.',
        check: ({ program }) =>
          blocksOf(program, 'variable').some((v) => v.name === 'Bumps' && v.action === 'set'),
      },
      {
        title: 'Count each bump',
        text: 'Add a **Loop** (forever). Inside it: a **Move** forward (unlimited), a **Wait** for the touch sensor on port 1 to be **pressed**, a Move **backward** for 1 rotation, a Move that turns, and a Variable block that **changes** Bumps **by 1**.',
        check: ({ program }) =>
          usesSensor(program, 'touch', ['wait']) &&
          blocksOf(program, 'variable').some(
            (v) => v.name === 'Bumps' && v.action === 'change' && v.value === 1,
          ),
      },
      {
        title: 'Show the count',
        text: 'After the change, add a **Display** block set to show a **Number**, and pick Bumps as its variable. Simulate on the **Obstacle room** mat: every time the robot hits a wall, the count goes up (also in the simulator’s variables list).',
        mat: 'walls',
        check: ({ program, sim }) =>
          blocksOf(program, 'display').length > 0 &&
          Number(sim?.variables().get('Bumps') ?? 0) >= 1,
      },
    ],
  },
];
