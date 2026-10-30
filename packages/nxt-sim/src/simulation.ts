import type {
  Expr,
  InputPort,
  IrProgram,
  OutputPort,
  SensorKind,
  Stmt,
  ValueType,
} from '@nxt/compiler';
import { Lcd } from './lcd.js';
import { idleMotor, isBusy, startMotors, stepMotor, stopMotors, type Motor } from './motors.js';
import { World, type Pose, type Scenario } from './world.js';

/** A value held in a variable. */
export type Value = number | boolean | string;

/** Where the simulation is. */
export type SimStatus = 'ready' | 'running' | 'paused' | 'finished' | 'error';

/** Things the simulated brick does that the user interface plays or shows. */
export type SimEvent =
  | { type: 'tone'; frequency: number; durationMs: number; volume: number }
  | { type: 'soundFile'; file: string; volume: number; loop: boolean }
  | { type: 'stopSound' }
  | { type: 'message'; connection: number; mailbox: number; value: Value };

/** The brick's buttons a program can read. */
export type ButtonName = 'left' | 'right' | 'enter';

/** Simulated time per step, in milliseconds. */
export const STEP_MS = 5;
/** Statements a task may run in one step before it has to let others run. */
const BUDGET = 400;
/** Length assumed for sound files, which the simulator cannot play. */
const SOUND_FILE_MS = 600;

type Flow = 'next' | 'break' | 'stop';
/** 'tick' = wait for the next step; 'pause' = stop here (breakpoint or single step). */
type Yield = 'tick' | 'pause';

interface Task {
  /** 'main', 'parallel 1', … */
  name: string;
  run: Generator<Yield, Flow>;
  done: boolean;
  /** Block (statement source) the task is running now. */
  current: string | undefined;
  budget: number;
}

/** A file in the simulated brick's flash. */
export interface OpenFile {
  data: string;
  readPos: number;
}

const defaultValue = (type: ValueType): Value =>
  type === 'number' ? 0 : type === 'boolean' ? false : '';

/** Number formatting used by the NXT-G Number to Text block (up to three decimals). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return String(Math.round(n * 1000) / 1000);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Options for {@link Simulation}. */
export interface SimOptions {
  /** Seed for the Random block, so runs can be repeated. */
  seed?: number;
}

/**
 * Runs a program (its IR) on a simulated brick and robot. Time only moves when
 * {@link advance} or {@link step} is called, so the caller controls the speed.
 *
 * Each task (the main beam and every parallel beam) is a generator; a task runs until it
 * has to wait, then the others get a turn, then the motors and robot move one step.
 * Statements carry the id of the block they came from, which drives the debugger:
 * {@link activeBlocks}, breakpoints and single-stepping work per block.
 */
export class Simulation {
  readonly world: World;
  readonly lcd = new Lcd();
  readonly motors: Motor[] = [idleMotor(), idleMotor(), idleMotor()];
  /** Sensor type per input port. */
  readonly sensors: (SensorKind | undefined)[] = [];
  readonly buttons: Record<ButtonName, boolean> = { left: false, right: false, enter: false };
  /** Mailboxes 1–10 (index 0–9), oldest message first. */
  readonly mailboxes: Value[][] = Array.from({ length: 10 }, () => []);
  /** Files written by the program, by name. */
  readonly files = new Map<string, OpenFile>();
  /** Block ids to pause at. */
  readonly breakpoints = new Set<string>();

  status: SimStatus = 'ready';
  /** Simulated milliseconds since the program started. */
  time = 0;
  /** Why the program stopped with an error. */
  error: string | null = null;

  private vars = new Map<string, Value>();
  private tasks: Task[] = [];
  private cursor = 0;
  private stepping = false;
  private listeners = new Set<(event: SimEvent) => void>();
  private random: () => number;
  private readonly subroutines: Map<string, Stmt[]>;

  constructor(
    readonly program: IrProgram,
    scenario: Scenario,
    options: SimOptions = {},
  ) {
    this.world = new World(scenario);
    this.random = mulberry32(options.seed ?? Date.now());
    this.subroutines = new Map(program.subroutines.map((s) => [s.name, s.body]));
    this.reset();
  }

  /** Back to the start: robot at its start position, screen blank, variables cleared. */
  reset(): void {
    this.world.reset();
    this.lcd.clear();
    for (const m of this.motors) Object.assign(m, idleMotor());
    this.sensors.length = 0;
    for (const [port, kind] of Object.entries(this.program.sensors)) {
      this.sensors[Number(port)] = kind;
    }
    for (const box of this.mailboxes) box.length = 0;
    this.files.clear();
    this.vars = new Map(this.program.variables.map((v) => [v.name, defaultValue(v.type)]));
    this.time = 0;
    this.error = null;
    this.cursor = 0;
    this.stepping = false;
    const lanes = [this.program.main, ...this.program.parallel];
    this.tasks = lanes.map((body, i) => {
      const task: Task = {
        name: i === 0 ? 'main' : `parallel ${i}`,
        run: undefined as unknown as Generator<Yield, Flow>,
        done: false,
        current: undefined,
        budget: BUDGET,
      };
      task.run = this.exec(task, body);
      return task;
    });
    this.status = 'ready';
  }

  /** Listens for sounds and messages. Returns a function that stops listening. */
  on(listener: (event: SimEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Current value of every variable, including hidden wire variables (`__w_…`). */
  variables(): ReadonlyMap<string, Value> {
    return this.vars;
  }

  /** The block each running task is on. */
  activeBlocks(): { task: string; block: string }[] {
    return this.tasks
      .filter((t) => !t.done && t.current !== undefined)
      .map((t) => ({ task: t.name, block: t.current! }));
  }

  /** Starts or continues running. */
  start(): void {
    if (this.status === 'finished' || this.status === 'error') this.reset();
    this.stepping = false;
    this.status = 'running';
  }

  pause(): void {
    if (this.status === 'running') this.status = 'paused';
  }

  /** Runs until any task moves on to another block, then pauses. */
  step(maxMs = 60_000): void {
    if (this.status === 'finished' || this.status === 'error') this.reset();
    this.stepping = true;
    this.status = 'running';
    this.advance(maxMs);
  }

  /** Presses or releases a brick button. */
  setButton(button: ButtonName, down: boolean): void {
    this.buttons[button] = down;
  }

  /** Sets what the sound sensor hears (0–100). */
  setSoundLevel(level: number): void {
    this.world.soundLevel = level;
  }

  /** Moves the robot (for example when the user drags it); clears its trail. */
  placeRobot(pose: Partial<Pose>): void {
    const next = { ...this.world.pose, ...pose };
    next.heading = ((next.heading % 360) + 360) % 360;
    this.world.pose = next;
    this.world.trail.length = 0;
    this.world.trail.push([next.x, next.y]);
  }

  /** Puts a message into a mailbox (1–10), as if another brick had sent it. */
  receive(mailbox: number, value: Value): void {
    const box = this.mailboxes[mailbox - 1];
    if (!box) return;
    box.push(value);
    if (box.length > 5) box.shift();
  }

  /**
   * Runs up to `ms` of simulated time (while running). Stops early at a breakpoint,
   * after a single step, or when the program ends.
   */
  advance(ms: number): void {
    let left = ms;
    while (this.status === 'running' && left > 0) {
      if (!this.runTasks()) return;
      this.physics(STEP_MS);
      this.time += STEP_MS;
      left -= STEP_MS;
      if (this.tasks.every((t) => t.done)) this.finish();
    }
  }

  /** Lets each task run until it waits. False when a task paused the simulation. */
  private runTasks(): boolean {
    for (; this.cursor < this.tasks.length; this.cursor++) {
      const task = this.tasks[this.cursor]!;
      if (task.done) continue;
      task.budget = BUDGET;
      try {
        const result = task.run.next();
        if (result.done) {
          task.done = true;
          task.current = undefined;
          if (result.value === 'stop') {
            this.finish();
            return false;
          }
        } else if (result.value === 'pause') {
          this.status = 'paused';
          this.stepping = false;
          return false;
        }
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        this.status = 'error';
        this.allMotorsOff();
        return false;
      }
    }
    this.cursor = 0;
    return true;
  }

  /**
   * Moves the motors and robot on by `dt` ms and advances the clock, without running
   * any program (used by {@link RxeVm}, which runs compiled code on this brick).
   */
  stepWorld(dt: number): void {
    this.physics(dt);
    this.time += dt;
  }

  /** Sends an event to listeners (for {@link RxeVm}). */
  emitEvent(event: SimEvent): void {
    this.emit(event);
  }

  private physics(dt: number): void {
    const turned = this.motors.map((m) => stepMotor(m, dt));
    // Driving base: motor B is the left wheel, motor C the right one.
    this.world.drive(turned[1]!, turned[2]!);
  }

  private finish(): void {
    this.status = 'finished';
    for (const t of this.tasks) {
      t.done = true;
      t.current = undefined;
    }
    this.allMotorsOff();
  }

  private allMotorsOff(): void {
    stopMotors(this.motors, [0, 1, 2], 'coast');
  }

  private emit(event: SimEvent): void {
    for (const l of this.listeners) l(event);
  }

  // ---- Interpreter -------------------------------------------------------

  /** Called before each statement: tracks the current block and decides whether to pause. */
  private enter(task: Task, stmt: Stmt): boolean {
    const source = stmt.source;
    if (source === undefined || source === task.current) return false;
    task.current = source;
    if (this.stepping || this.breakpoints.has(source)) return true;
    return false;
  }

  private *exec(task: Task, body: readonly Stmt[]): Generator<Yield, Flow> {
    for (const stmt of body) {
      if (this.enter(task, stmt)) yield 'pause';
      if (--task.budget <= 0) {
        yield 'tick';
      }
      const flow = yield* this.execOne(task, stmt);
      if (flow !== 'next') return flow;
    }
    return 'next';
  }

  /** Runs a loop body; a new pass counts as entering its blocks again. */
  private *pass(task: Task, loop: Stmt, body: readonly Stmt[]): Generator<Yield, Flow> {
    task.current = loop.source ?? task.current;
    const flow = yield* this.exec(task, body);
    // Give other tasks a turn on every pass, like the brick's scheduler does.
    yield 'tick';
    return flow;
  }

  private *waitUntil(done: () => boolean): Generator<Yield, void> {
    while (!done()) yield 'tick';
  }

  private *execOne(task: Task, s: Stmt): Generator<Yield, Flow> {
    switch (s.kind) {
      case 'motor': {
        const degrees = s.degrees ? Math.abs(this.num(s.degrees)) : null;
        const power = this.num(s.power);
        startMotors(this.motors, s.ports, power, this.num(s.turnRatio), degrees, s.then);
        if (degrees !== null && s.wait) {
          yield* this.waitUntil(() => s.ports.every((p) => !isBusy(this.motors[p]!)));
        }
        return 'next';
      }
      case 'motorStop':
        stopMotors(this.motors, s.ports, s.mode);
        return 'next';
      case 'resetMotor':
        this.motors[s.port]!.rotation = 0;
        return 'next';
      case 'setSensor':
        this.sensors[s.port] = s.sensor;
        return 'next';
      case 'tone': {
        const durationMs = Math.max(0, this.num(s.durationMs));
        this.emit({
          type: 'tone',
          frequency: this.num(s.frequency),
          durationMs,
          volume: this.num(s.volume),
        });
        if (s.wait) yield* this.sleep(durationMs);
        return 'next';
      }
      case 'soundFile':
        this.emit({ type: 'soundFile', file: s.file, volume: this.num(s.volume), loop: s.loop });
        if (s.wait) yield* this.sleep(SOUND_FILE_MS);
        return 'next';
      case 'stopSound':
        this.emit({ type: 'stopSound' });
        return 'next';
      case 'clearScreen':
        this.lcd.clear();
        return 'next';
      case 'drawText':
        this.lcd.text(this.num(s.x), this.num(s.line), this.str(s.text));
        return 'next';
      case 'drawNumber':
        this.lcd.text(this.num(s.x), this.num(s.line), formatNumber(this.num(s.value)));
        return 'next';
      case 'drawImage':
        this.lcd.picture(this.num(s.x), this.num(s.line));
        return 'next';
      case 'drawPoint':
        this.lcd.point(this.num(s.x), this.num(s.y));
        return 'next';
      case 'drawLine':
        this.lcd.line(this.num(s.x), this.num(s.y), this.num(s.endX), this.num(s.endY));
        return 'next';
      case 'drawCircle':
        this.lcd.circle(this.num(s.x), this.num(s.y), this.num(s.radius));
        return 'next';
      case 'file':
        this.fileAccess(s);
        return 'next';
      case 'messageWrite':
        this.emit({
          type: 'message',
          connection: s.connection,
          mailbox: this.num(s.mailbox),
          value: this.eval(s.value),
        });
        return 'next';
      case 'messageRead': {
        const box = this.mailboxes[this.num(s.mailbox) - 1];
        const message = box?.shift();
        this.vars.set(s.received, message !== undefined);
        if (message !== undefined) this.vars.set(s.target, this.coerce(message, s.valueType));
        return 'next';
      }
      case 'wait':
        yield* this.sleep(this.num(s.ms));
        return 'next';
      case 'waitUntil':
        yield* this.waitUntil(() => this.bool(s.condition));
        return 'next';
      case 'set':
        this.vars.set(s.name, this.eval(s.value));
        return 'next';
      case 'if':
        return yield* this.exec(task, this.bool(s.condition) ? s.then : s.else);
      case 'while':
        while (this.bool(s.condition)) {
          const flow = yield* this.pass(task, s, s.body);
          if (flow === 'break') break;
          if (flow === 'stop') return flow;
        }
        return 'next';
      case 'repeat': {
        const count = this.num(s.count);
        for (let i = 0; i < count; i++) {
          const flow = yield* this.pass(task, s, s.body);
          if (flow === 'break') break;
          if (flow === 'stop') return flow;
        }
        return 'next';
      }
      case 'forever':
        for (;;) {
          const flow = yield* this.pass(task, s, s.body);
          if (flow === 'break') return 'next';
          if (flow === 'stop') return flow;
        }
      case 'break':
        return 'break';
      case 'call': {
        const body = this.subroutines.get(s.name);
        if (!body) throw new Error(`Unknown My Block "${s.name}"`);
        const flow = yield* this.exec(task, body);
        return flow === 'stop' ? 'stop' : 'next';
      }
      case 'stop':
        return 'stop';
    }
  }

  private *sleep(ms: number): Generator<Yield, void> {
    const end = this.time + ms;
    yield* this.waitUntil(() => this.time >= end);
  }

  private fileAccess(s: Extract<Stmt, { kind: 'file' }>): void {
    const name = this.str(s.file);
    switch (s.action) {
      case 'write': {
        const file = this.files.get(name) ?? { data: '', readPos: 0 };
        const value = s.value ? this.eval(s.value) : '';
        file.data += `${typeof value === 'number' ? formatNumber(value) : String(value)}\r\n`;
        this.files.set(name, file);
        return;
      }
      case 'read': {
        const file = this.files.get(name);
        let line = '';
        if (file) {
          const end = file.data.indexOf('\r\n', file.readPos);
          const stop = end < 0 ? file.data.length : end;
          line = file.data.slice(file.readPos, stop);
          file.readPos = end < 0 ? stop : end + 2;
        }
        if (s.target) {
          this.vars.set(s.target, s.valueType === 'number' ? Number(line) || 0 : line);
        }
        return;
      }
      case 'close': {
        const file = this.files.get(name);
        if (file) file.readPos = 0;
        return;
      }
      case 'delete':
        this.files.delete(name);
        return;
    }
  }

  // ---- Expressions -------------------------------------------------------

  private num(e: Expr): number {
    const v = this.eval(e);
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
  }

  private bool(e: Expr): boolean {
    const v = this.eval(e);
    return typeof v === 'string' ? v.length > 0 : Boolean(v);
  }

  private str(e: Expr): string {
    const v = this.eval(e);
    return typeof v === 'number' ? formatNumber(v) : String(v);
  }

  private coerce(v: Value, type: ValueType): Value {
    if (type === 'number') return typeof v === 'number' ? v : Number(v) || 0;
    if (type === 'boolean') return typeof v === 'boolean' ? v : Boolean(v);
    return typeof v === 'number' ? formatNumber(v) : String(v);
  }

  /** Reading of a sensor port in NXT-G units. */
  readSensor(port: InputPort): number {
    const kind = this.sensors[port];
    return kind ? this.world.read(kind) : 0;
  }

  /** Rotation sensor reading of a motor, in whole degrees. */
  motorDegrees(port: OutputPort): number {
    return Math.trunc(this.motors[port]!.rotation);
  }

  private eval(e: Expr): Value {
    switch (e.kind) {
      case 'number':
      case 'boolean':
      case 'text':
        return e.value;
      case 'var':
        return this.vars.get(e.name) ?? 0;
      case 'not':
        return !this.bool(e.operand);
      case 'random': {
        const min = Math.round(this.num(e.min));
        const max = Math.round(this.num(e.max));
        const [lo, hi] = min <= max ? [min, max] : [max, min];
        return lo + Math.floor(this.random() * (hi - lo + 1));
      }
      case 'sensor':
        return this.readSensor(e.port);
      case 'motorDegrees':
        return this.motorDegrees(e.port);
      case 'tick':
        return Math.floor(this.time);
      case 'button':
        return this.buttons[e.button];
      case 'choose':
        return this.bool(e.condition) ? this.eval(e.then) : this.eval(e.else);
      case 'numberToText':
        return formatNumber(this.num(e.value));
      case 'concat':
        return e.parts.map((p) => this.str(p)).join('');
      case 'binary': {
        const { op } = e;
        if (op === 'and') return this.bool(e.left) && this.bool(e.right);
        if (op === 'or') return this.bool(e.left) || this.bool(e.right);
        const l = this.eval(e.left);
        const r = this.eval(e.right);
        if (op === '==' || op === '!=') {
          const same =
            typeof l === 'string' || typeof r === 'string'
              ? String(l) === String(r)
              : this.toNum(l) === this.toNum(r);
          return op === '==' ? same : !same;
        }
        const a = this.toNum(l);
        const b = this.toNum(r);
        switch (op) {
          case '+':
            return a + b;
          case '-':
            return a - b;
          case '*':
            return a * b;
          case '/':
            return b === 0 ? 0 : a / b;
          case '%':
            return b === 0 ? a : a % b;
          case '<':
            return a < b;
          case '>':
            return a > b;
          case '<=':
            return a <= b;
          case '>=':
            return a >= b;
        }
      }
    }
  }

  private toNum(v: Value): number {
    return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : Number(v) || 0;
  }
}
