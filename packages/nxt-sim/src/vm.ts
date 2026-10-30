import type { InputPort, OutputPort, SensorKind } from '@nxt/compiler';
import {
  CMP,
  IO_IN,
  IO_OUT,
  NOT_A_DS_ID,
  OP,
  OUT_MODE,
  OUT_REGMODE,
  OUT_RUNSTATE,
  SENSOR_TYPE,
  SOUND_STATE,
  SYSCALL,
  TC,
  UF,
  decodeInstructionWord,
  initialValues,
  readRxe,
  type RxeFile,
} from '@nxt/rxe';
import { isBusy, startMotors, stopMotors } from './motors.js';
import { STEP_MS, type Simulation, type Value } from './simulation.js';

/**
 * A small interpreter for .rxe files, running against a {@link Simulation}'s brick (its
 * motors, sensors, screen, buttons, mailboxes and files). It exists to test the compiler:
 * a compiled program run here should behave like its IR run by the simulator.
 *
 * It implements the instructions and system calls the compiler emits, following the
 * Executable File Specification v1.0. Clumps are scheduled round-robin, a few
 * instructions at a time, like the firmware's cooperative multitasking.
 */
export class RxeVm {
  readonly file: RxeFile;
  /** Values by DSTOC index: numbers for scalars, byte/number lists for arrays. */
  private readonly values = new Map<number, number | number[]>();
  private readonly types: number[];
  /** Fields (DSTOC indexes) of each cluster record. */
  private readonly clusterFields = new Map<number, number[]>();
  private readonly clumps: {
    start: number;
    pc: number;
    fireCount: number;
    state: 'idle' | 'ready' | 'waiting' | 'done';
  }[];
  private queue: number[] = [];
  private readonly mutexes = new Map<number, { owner: number | null; waiting: number[] }>();
  private readonly pendingOut = new Map<number, Map<number, number>>();
  private readonly handles = new Map<number, { name: string; write: boolean; pos: number }>();
  private nextHandle = 1;
  private lsReply = new Map<number, number[]>();
  private random = 12345;
  stopped = false;
  error: string | null = null;

  constructor(
    bytes: Uint8Array,
    private readonly sim: Simulation,
  ) {
    this.file = readRxe(bytes);
    this.types = this.file.toc.map((t) => t.type);
    for (const [id, v] of initialValues(this.file)) this.values.set(id, v);
    this.indexClusters();
    this.clumps = this.file.clumps.map((c) => ({
      start: c.codeStart,
      pc: c.codeStart,
      fireCount: c.fireCount,
      state: c.fireCount === 0 ? 'ready' : 'idle',
    }));
    this.queue = this.clumps.flatMap((c, i) => (c.state === 'ready' ? [i] : []));
  }

  /** True while any clump can still run. */
  get running(): boolean {
    return (
      !this.stopped &&
      this.error === null &&
      this.clumps.some((c) => c.state === 'ready' || c.state === 'waiting')
    );
  }

  /** Current value of a dataspace item (for tests). */
  value(id: number): number | number[] | undefined {
    return this.values.get(id);
  }

  /** Runs for `ms` of simulated time: instructions, then a physics step, repeatedly. */
  advance(ms: number, instructionsPerStep = 400): void {
    for (let t = 0; t < ms && this.running; t += STEP_MS) {
      this.runInstructions(instructionsPerStep);
      this.sim.stepWorld(STEP_MS);
    }
  }

  /** Runs up to `budget` instructions, switching clumps every few instructions. */
  runInstructions(budget: number): void {
    while (budget > 0 && this.running && this.queue.length > 0) {
      const clump = this.queue.shift()!;
      for (let slice = 0; slice < 20 && budget > 0; slice++, budget--) {
        if (this.clumps[clump]!.state !== 'ready') break;
        try {
          this.step(clump);
        } catch (error) {
          this.error = error instanceof Error ? error.message : String(error);
          return;
        }
        if (this.stopped) return;
      }
      if (this.clumps[clump]!.state === 'ready') this.queue.push(clump);
    }
  }

  // ---- Data --------------------------------------------------------------

  private indexClusters(): void {
    const toc = this.file.toc;
    const skip = (i: number): number => {
      const r = toc[i]!;
      if (r.type === TC.ARRAY) return skip(i + 1);
      if (r.type === TC.CLUSTER) {
        let j = i + 1;
        for (let k = 0; k < r.descriptor; k++) j = skip(j);
        return j;
      }
      return i + 1;
    };
    toc.forEach((r, i) => {
      if (r.type !== TC.CLUSTER) return;
      const fields: number[] = [];
      let j = i + 1;
      for (let k = 0; k < r.descriptor; k++) {
        fields.push(j);
        j = skip(j);
      }
      this.clusterFields.set(i, fields);
    });
  }

  private field(cluster: number, i: number): number {
    const f = this.clusterFields.get(cluster)?.[i];
    if (f === undefined) throw new Error(`Item ${cluster} has no field ${i}`);
    return f;
  }

  private get(id: number): number {
    const v = this.values.get(id);
    if (typeof v !== 'number') throw new Error(`Item ${id} is not a scalar`);
    return v;
  }

  private arr(id: number): number[] {
    const v = this.values.get(id);
    if (!Array.isArray(v)) throw new Error(`Item ${id} is not an array`);
    return v;
  }

  private isArray(id: number): boolean {
    return this.types[id] === TC.ARRAY;
  }

  /** Stores a number, converted to the item's type like a C cast. */
  private set(id: number, v: number): void {
    const n = Math.trunc(v);
    switch (this.types[id]) {
      case TC.UBYTE:
        return void this.values.set(id, n & 0xff);
      case TC.SBYTE:
        return void this.values.set(id, (n << 24) >> 24);
      case TC.UWORD:
        return void this.values.set(id, n & 0xffff);
      case TC.SWORD:
        return void this.values.set(id, (n << 16) >> 16);
      case TC.ULONG:
        return void this.values.set(id, n >>> 0);
      case TC.SLONG:
        return void this.values.set(id, n | 0);
      default:
        throw new Error(`Item ${id} is not a number`);
    }
  }

  private setArr(id: number, v: number[]): void {
    if (!this.isArray(id)) throw new Error(`Item ${id} is not an array`);
    this.values.set(id, v);
  }

  private text(id: number): string {
    const bytes = this.arr(id);
    const end = bytes.indexOf(0);
    return String.fromCharCode(...(end < 0 ? bytes : bytes.slice(0, end)));
  }

  private setText(id: number, s: string): void {
    this.setArr(id, [...Array.from(s, (c) => c.charCodeAt(0) & 0xff), 0]);
  }

  // ---- Instructions ------------------------------------------------------

  private step(index: number): void {
    const clump = this.clumps[index]!;
    const code = this.file.code;
    const at = clump.pc;
    const first = code[at];
    if (first === undefined) throw new Error('Ran past the end of the code');
    const { opcode, size: nibble, flags } = decodeInstructionWord(first);
    if (flags & 0x8) throw new Error('Short instructions are not supported by this VM');
    const size = nibble === 0xe ? code[at + 1]! : nibble;
    const args = code.slice(at + (nibble === 0xe ? 2 : 1), at + size / 2);
    const cmp = flags & 0x7;
    clump.pc = at + size / 2;
    const [a = 0, b = 0, c = 0, d = 0, e = 0] = args;

    switch (opcode) {
      case OP.ADD:
      case OP.SUB:
      case OP.MUL:
      case OP.DIV:
      case OP.MOD:
      case OP.AND:
      case OP.OR:
      case OP.XOR: {
        const x = this.get(b);
        const y = this.get(c);
        this.set(a, arithmetic(opcode, x, y));
        return;
      }
      case OP.NEG:
        return this.set(a, -this.get(b));
      case OP.NOT:
        return this.set(a, this.get(b) === 0 ? 1 : 0);
      case OP.CMP:
        return this.set(a, this.compare(cmp, b, c) ? 1 : 0);
      case OP.TST:
        return this.set(a, compareNumbers(cmp, this.get(b), 0) ? 1 : 0);
      case OP.MOV:
        if (this.isArray(b)) this.setArr(a, [...this.arr(b)]);
        else this.set(a, this.get(b));
        return;
      case OP.SET:
        return this.set(a, b);
      case OP.INDEX: {
        const i = c === NOT_A_DS_ID ? 0 : this.get(c);
        return this.set(a, this.arr(b)[i] ?? 0);
      }
      case OP.ARRSIZE:
        return this.set(a, this.arr(b).length);
      case OP.ARRBUILD:
        return this.setArr(
          a,
          args.slice(1).flatMap((id) => (this.isArray(id) ? this.arr(id) : [this.get(id)])),
        );
      case OP.STRCAT:
        return this.setText(
          a,
          args
            .slice(1)
            .map((id) => this.text(id))
            .join(''),
        );
      case OP.NUMTOSTRING:
        return this.setText(a, String(this.get(b)));
      case OP.STRINGTONUM: {
        const s = this.text(c);
        const from = d === NOT_A_DS_ID ? 0 : this.get(d);
        const m = /[-+]?\d+/.exec(s.slice(from));
        if (m) {
          this.set(a, Number(m[0]));
          this.set(b, from + m.index + m[0].length);
        } else this.set(a, e === NOT_A_DS_ID ? 0 : this.get(e));
        return;
      }
      case OP.FLATTEN:
        return this.setArr(a, [...this.flatten(b), 0]);
      case OP.UNFLATTEN: {
        const bytes = this.arr(c).slice(0, -1);
        const size = scalarBytes(this.types[a]!);
        if (bytes.length !== size) {
          this.set(b, 1);
          this.set(a, this.get(d));
          return;
        }
        this.set(b, 0);
        return this.set(
          a,
          bytes.reduce((v, byte, i) => v + byte * 2 ** (8 * i), 0),
        );
      }
      case OP.JMP:
        clump.pc = at + signed16(a);
        return;
      case OP.BRCMP:
        if (this.compare(cmp, b, c)) clump.pc = at + signed16(a);
        return;
      case OP.BRTST:
        if (compareNumbers(cmp, this.get(b), 0)) clump.pc = at + signed16(a);
        return;
      case OP.STOP:
        if (a === NOT_A_DS_ID || this.get(a) !== 0) this.stopped = true;
        return;
      case OP.FINCLUMP: {
        clump.state = 'done';
        clump.pc = clump.start;
        const deps = this.file.clumps[index]!.dependents;
        if (signed16(a) >= 0 && signed16(b) >= 0) {
          for (let i = a; i <= b && i < deps.length; i++) this.fire(deps[i]!);
        }
        return;
      }
      case OP.FINCLUMPIMMED:
        clump.state = 'done';
        clump.pc = clump.start;
        this.fire(a);
        return;
      case OP.ACQUIRE: {
        const m = this.mutexes.get(a) ?? { owner: null, waiting: [] };
        this.mutexes.set(a, m);
        if (m.owner === null) m.owner = index;
        else {
          m.waiting.push(index);
          clump.state = 'waiting';
        }
        return;
      }
      case OP.RELEASE: {
        const m = this.mutexes.get(a);
        if (!m) return;
        m.owner = m.waiting.shift() ?? null;
        if (m.owner !== null) this.wake(m.owner);
        return;
      }
      case OP.SUBCALL: {
        this.set(b, index);
        clump.state = 'waiting';
        const sub = this.clumps[a]!;
        sub.pc = sub.start;
        this.wake(a);
        return;
      }
      case OP.SUBRET:
        clump.state = 'idle';
        clump.pc = clump.start;
        this.wake(this.get(a));
        return;
      case OP.SYSCALL:
        return this.syscall(a, b);
      case OP.SETIN:
        return this.setIn(this.get(b) as InputPort, c, this.get(a));
      case OP.GETIN:
        return this.set(a, this.getIn(this.get(b) as InputPort, c));
      case OP.SETOUT: {
        const ports = this.isArray(a) ? this.arr(a) : [this.get(a)];
        const props = new Map<number, number>();
        for (let i = 1; i + 1 < args.length; i += 2) props.set(args[i]!, this.get(args[i + 1]!));
        return this.setOut(ports as OutputPort[], props);
      }
      case OP.GETOUT:
        return this.set(a, this.getOut(this.get(b) as OutputPort, c));
      case OP.GETTICK:
        return this.set(a, Math.floor(this.sim.time));
      default:
        throw new Error(`Opcode 0x${opcode.toString(16)} is not supported by this VM`);
    }
  }

  private fire(clump: number): void {
    const c = this.clumps[clump];
    if (!c) return;
    c.fireCount = Math.max(0, c.fireCount - 1);
    if (c.fireCount === 0) this.wake(clump);
  }

  private wake(clump: number): void {
    const c = this.clumps[clump]!;
    c.state = 'ready';
    if (!this.queue.includes(clump)) this.queue.push(clump);
  }

  private compare(cmp: number, a: number, b: number): boolean {
    if (this.isArray(a) || this.isArray(b)) {
      const x = this.isArray(a) ? this.arr(a) : [this.get(a)];
      const y = this.isArray(b) ? this.arr(b) : [this.get(b)];
      let order = 0;
      for (let i = 0; i < Math.min(x.length, y.length) && order === 0; i++) order = x[i]! - y[i]!;
      if (order === 0) order = x.length - y.length;
      return compareNumbers(cmp, order, 0);
    }
    return compareNumbers(cmp, this.get(a), this.get(b));
  }

  private flatten(id: number): number[] {
    if (this.isArray(id)) return this.arr(id);
    const size = scalarBytes(this.types[id]!);
    const v = this.get(id);
    return Array.from({ length: size }, (_, i) => (v >>> (8 * i)) & 0xff);
  }

  // ---- Ports -------------------------------------------------------------

  private setIn(port: InputPort, prop: number, value: number): void {
    const p = this.pendingOut.get(100 + port) ?? new Map<number, number>();
    p.set(prop, value);
    this.pendingOut.set(100 + port, p);
    if (prop === IO_IN.TYPE || prop === IO_IN.MODE) {
      const kind = sensorKind(p.get(IO_IN.TYPE) ?? 0);
      if (kind) this.sim.sensors[port] = kind;
    }
  }

  private getIn(port: InputPort, prop: number): number {
    if (prop === IO_IN.INVALID_DATA) return 0;
    if (prop === IO_IN.SCALED_VAL) return this.sim.readSensor(port);
    return 0;
  }

  private setOut(ports: OutputPort[], props: Map<number, number>): void {
    for (const port of ports) {
      const pending = this.pendingOut.get(port) ?? new Map<number, number>();
      for (const [k, v] of props) if (k !== IO_OUT.FLAGS) pending.set(k, v);
      this.pendingOut.set(port, pending);
    }
    const flags = props.get(IO_OUT.FLAGS) ?? 0;
    if (flags & UF.UPDATE_RESET_ROTATION_COUNT) {
      for (const port of ports) this.sim.motors[port]!.rotation = 0;
    }
    if (!(flags & (UF.UPDATE_MODE | UF.UPDATE_SPEED))) return;
    const p = this.pendingOut.get(ports[0]!)!;
    const mode = p.get(IO_OUT.MODE) ?? 0;
    const runState = p.get(IO_OUT.RUN_STATE) ?? OUT_RUNSTATE.IDLE;
    const speed = (p.get(IO_OUT.SPEED) ?? 0) as number;
    const sync = (p.get(IO_OUT.REG_MODE) ?? 0) === OUT_REGMODE.SYNC && ports.length === 2;
    const limit = flags & UF.UPDATE_TACHO_LIMIT ? (p.get(IO_OUT.TACH_LIMIT) ?? 0) : 0;
    if (!(mode & OUT_MODE.MOTORON) || runState === OUT_RUNSTATE.IDLE) {
      stopMotors(this.sim.motors, ports, 'coast');
    } else if (speed === 0 && limit === 0) {
      stopMotors(this.sim.motors, ports, mode & OUT_MODE.BRAKE ? 'brake' : 'coast');
    } else {
      startMotors(
        this.sim.motors,
        ports,
        speed,
        sync ? (p.get(IO_OUT.TURN_RATIO) ?? 0) : 0,
        limit === 0 ? null : limit,
        mode & OUT_MODE.BRAKE ? 'brake' : 'coast',
      );
    }
  }

  private getOut(port: OutputPort, prop: number): number {
    const m = this.sim.motors[port]!;
    switch (prop) {
      case IO_OUT.RUN_STATE:
        return m.mode === 'run' && (m.remaining === null || isBusy(m))
          ? OUT_RUNSTATE.RUNNING
          : OUT_RUNSTATE.IDLE;
      case IO_OUT.ROTATION_COUNT:
      case IO_OUT.TACH_COUNT:
      case IO_OUT.BLOCK_TACH_COUNT:
        return Math.trunc(m.rotation);
      default:
        return this.pendingOut.get(port)?.get(prop) ?? 0;
    }
  }

  // ---- System calls ------------------------------------------------------

  private syscall(id: number, params: number): void {
    const f = (i: number) => this.field(params, i);
    const loc = (i: number) =>
      [this.get(this.field(f(i), 0)), this.get(this.field(f(i), 1))] as const;
    const lcd = this.sim.lcd;
    const clear = (i: number) => {
      if (this.get(f(i)) & 1) lcd.clear();
    };
    switch (id) {
      case SYSCALL.GetStartTick:
        return this.set(f(0), 0);
      case SYSCALL.DrawText: {
        clear(3);
        const [x, y] = loc(1);
        const line = 8 - Math.floor(y / 8);
        if (this.text(f(2))) lcd.text(x, line, this.text(f(2)));
        return;
      }
      case SYSCALL.DrawPoint: {
        clear(2);
        const [x, y] = loc(1);
        return lcd.point(x, y);
      }
      case SYSCALL.DrawLine: {
        clear(3);
        const [x, y] = loc(1);
        const [x2, y2] = loc(2);
        return lcd.line(x, y, x2, y2);
      }
      case SYSCALL.DrawCircle: {
        clear(3);
        const [x, y] = loc(1);
        return lcd.circle(x, y, this.get(f(2)));
      }
      case SYSCALL.DrawPicture: {
        clear(4);
        const [x, y] = loc(1);
        return lcd.picture(x, 8 - Math.floor(y / 8));
      }
      case SYSCALL.SoundPlayTone:
        return this.sim.emitEvent({
          type: 'tone',
          frequency: this.get(f(1)),
          durationMs: this.get(f(2)),
          volume: this.get(f(4)) * 25,
        });
      case SYSCALL.SoundPlayFile:
        return this.sim.emitEvent({
          type: 'soundFile',
          file: this.text(f(1)),
          loop: this.get(f(2)) !== 0,
          volume: this.get(f(3)) * 25,
        });
      case SYSCALL.SoundGetState:
        this.set(f(0), SOUND_STATE.IDLE);
        return this.set(f(1), 0);
      case SYSCALL.SoundSetState:
        if (this.get(f(1)) === SOUND_STATE.STOP) this.sim.emitEvent({ type: 'stopSound' });
        return this.set(f(0), 0);
      case SYSCALL.ReadButton: {
        const name = (['', 'right', 'left', 'enter'] as const)[this.get(f(1))];
        this.set(f(0), name ? 0 : -1);
        return this.set(f(2), name && this.sim.buttons[name] ? 1 : 0);
      }
      case SYSCALL.RandomNumber:
        this.random = (this.random * 1103515245 + 12345) & 0x7fffffff;
        return this.set(f(0), (this.random >> 8) - 0x4000);
      case SYSCALL.CommLSWrite: {
        const port = this.get(f(1));
        this.lsReply.set(port, [this.sim.readSensor(port as InputPort)]);
        return this.set(f(0), 0);
      }
      case SYSCALL.CommLSCheckStatus:
        this.set(f(0), 0);
        return this.set(f(2), this.lsReply.get(this.get(f(1)))?.length ?? 0);
      case SYSCALL.CommLSRead:
        this.setArr(f(2), this.lsReply.get(this.get(f(1))) ?? []);
        return this.set(f(0), 0);
      case SYSCALL.MessageWrite:
        this.sim.emitEvent({
          type: 'message',
          connection: 0,
          mailbox: this.get(f(1)) - 9,
          value: this.text(f(2)),
        });
        return this.set(f(0), 0);
      case SYSCALL.CommBTWrite: {
        const packet = this.arr(f(2));
        const data = packet.slice(4, 4 + (packet[3] ?? 0) - 1);
        this.sim.emitEvent({
          type: 'message',
          connection: this.get(f(1)),
          mailbox: (packet[2] ?? 0) + 1,
          value: String.fromCharCode(...data),
        });
        return this.set(f(0), 0);
      }
      case SYSCALL.CommBTCheckStatus:
        return this.set(f(0), 0);
      case SYSCALL.MessageRead: {
        const box = this.sim.mailboxes[this.get(f(1))];
        const message = box?.shift();
        if (message === undefined) return this.set(f(0), 64);
        this.setArr(f(3), [...messageBytes(message), 0]);
        return this.set(f(0), 0);
      }
      case SYSCALL.FileResolveHandle: {
        const name = this.text(f(3));
        const found = [...this.handles].find(([, h]) => h.name === name);
        if (!found) return this.set(f(0), 0x8700);
        this.set(f(1), found[0]);
        this.set(f(2), found[1].write ? 1 : 0);
        return this.set(f(0), 0);
      }
      case SYSCALL.FileOpenWrite:
      case SYSCALL.FileOpenAppend:
      case SYSCALL.FileOpenRead: {
        const name = this.text(f(2));
        const exists = this.sim.files.has(name);
        if (id === SYSCALL.FileOpenWrite && exists) return this.set(f(0), 0x8f00);
        if (id !== SYSCALL.FileOpenWrite && !exists) return this.set(f(0), 0x8700);
        if (!exists) this.sim.files.set(name, { data: '', readPos: 0 });
        const handle = this.nextHandle++;
        this.handles.set(handle, { name, write: id !== SYSCALL.FileOpenRead, pos: 0 });
        this.set(f(1), handle);
        this.set(f(3), this.sim.files.get(name)!.data.length);
        return this.set(f(0), 0);
      }
      case SYSCALL.FileWrite: {
        const h = this.handles.get(this.get(f(1)));
        if (!h) return this.set(f(0), 0x9300);
        const bytes = this.arr(f(2)).slice(0, this.get(f(3)));
        this.sim.files.get(h.name)!.data += String.fromCharCode(...bytes);
        return this.set(f(0), 0);
      }
      case SYSCALL.FileRead: {
        const h = this.handles.get(this.get(f(1)));
        if (!h) return this.set(f(0), 0x9300);
        const data = this.sim.files.get(h.name)?.data ?? '';
        const chunk = data.slice(h.pos, h.pos + this.get(f(3)));
        h.pos += chunk.length;
        this.setText(f(2), chunk);
        this.set(f(3), chunk.length);
        return this.set(f(0), chunk.length ? 0 : 0x8500);
      }
      case SYSCALL.FileClose:
        this.handles.delete(this.get(f(1)));
        return this.set(f(0), 0);
      case SYSCALL.FileDelete: {
        const existed = this.sim.files.delete(this.text(f(1)));
        return this.set(f(0), existed ? 0 : 0x8700);
      }
      default:
        throw new Error(`System call 0x${id.toString(16)} is not supported by this VM`);
    }
  }
}

function signed16(v: number): number {
  return (v << 16) >> 16;
}

function scalarBytes(tc: number): number {
  return tc === TC.UBYTE || tc === TC.SBYTE ? 1 : tc === TC.UWORD || tc === TC.SWORD ? 2 : 4;
}

function compareNumbers(cmp: number, a: number, b: number): boolean {
  switch (cmp) {
    case CMP.LT:
      return a < b;
    case CMP.GT:
      return a > b;
    case CMP.LTEQ:
      return a <= b;
    case CMP.GTEQ:
      return a >= b;
    case CMP.EQ:
      return a === b;
    default:
      return a !== b;
  }
}

function arithmetic(op: number, x: number, y: number): number {
  switch (op) {
    case OP.ADD:
      return x + y;
    case OP.SUB:
      return x - y;
    case OP.MUL:
      return Math.imul(x, y);
    case OP.DIV:
      return y === 0 ? 0 : Math.trunc(x / y);
    case OP.MOD:
      return y === 0 ? x : x % y;
    case OP.AND:
      return x & y;
    case OP.OR:
      return x | y;
    default:
      return x ^ y;
  }
}

function sensorKind(type: number): SensorKind | null {
  switch (type) {
    case SENSOR_TYPE.SWITCH:
      return 'touch';
    case SENSOR_TYPE.LIGHT_ACTIVE:
      return 'lightActive';
    case SENSOR_TYPE.LIGHT_INACTIVE:
      return 'lightAmbient';
    case SENSOR_TYPE.SOUND_DB:
      return 'soundDb';
    case SENSOR_TYPE.SOUND_DBA:
      return 'soundDba';
    case SENSOR_TYPE.LOWSPEED_9V:
      return 'ultrasonic';
    case SENSOR_TYPE.COLORFULL:
      return 'colorFull';
    case SENSOR_TYPE.COLORRED:
      return 'colorRed';
    case SENSOR_TYPE.COLORGREEN:
      return 'colorGreen';
    case SENSOR_TYPE.COLORBLUE:
      return 'colorBlue';
    case SENSOR_TYPE.COLORNONE:
      return 'colorNone';
    default:
      return null;
  }
}

/** A mailbox message as bytes: numbers as 4 little-endian bytes, logic as one byte. */
function messageBytes(v: Value): number[] {
  if (typeof v === 'number') return [0, 1, 2, 3].map((i) => (Math.trunc(v) >>> (8 * i)) & 0xff);
  if (typeof v === 'boolean') return [v ? 1 : 0];
  return Array.from(v, (c) => c.charCodeAt(0) & 0xff);
}
