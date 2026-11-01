import {
  CMP,
  CodeBuilder,
  Dataspace,
  IO_IN,
  IO_OUT,
  NOT_A_DS_ID,
  OP,
  OUT_MODE,
  OUT_REGMODE,
  OUT_RUNSTATE,
  SENSOR_MODE,
  SENSOR_TYPE,
  SOUND_STATE,
  SYSCALL,
  T,
  TC,
  UF,
  stringBytes,
  writeRxe,
  type ComparisonCode,
  type DsItem,
  type DsType,
  type Label,
} from '@nxt/rxe';
import type {
  BinaryOp,
  Expr,
  InputPort,
  IrProgram,
  OutputPort,
  SensorKind,
  Stmt,
  ValueType,
} from './ir.js';

/** Thrown when a program cannot be compiled (for example, too large for the brick). */
export class CompileError extends Error {
  constructor(
    message: string,
    readonly source?: string,
  ) {
    super(message);
    this.name = 'CompileError';
  }
}

/** Sensor type and mode per IR sensor kind. */
const SENSOR_SETUP: Record<SensorKind, [type: number, mode: number]> = {
  touch: [SENSOR_TYPE.SWITCH, SENSOR_MODE.BOOLEAN],
  lightActive: [SENSOR_TYPE.LIGHT_ACTIVE, SENSOR_MODE.PCTFULLSCALE],
  lightAmbient: [SENSOR_TYPE.LIGHT_INACTIVE, SENSOR_MODE.PCTFULLSCALE],
  soundDb: [SENSOR_TYPE.SOUND_DB, SENSOR_MODE.PCTFULLSCALE],
  soundDba: [SENSOR_TYPE.SOUND_DBA, SENSOR_MODE.PCTFULLSCALE],
  ultrasonic: [SENSOR_TYPE.LOWSPEED_9V, SENSOR_MODE.RAW],
  colorFull: [SENSOR_TYPE.COLORFULL, SENSOR_MODE.RAW],
  colorRed: [SENSOR_TYPE.COLORRED, SENSOR_MODE.PCTFULLSCALE],
  colorGreen: [SENSOR_TYPE.COLORGREEN, SENSOR_MODE.PCTFULLSCALE],
  colorBlue: [SENSOR_TYPE.COLORBLUE, SENSOR_MODE.PCTFULLSCALE],
  colorNone: [SENSOR_TYPE.COLORNONE, SENSOR_MODE.PCTFULLSCALE],
};

const COMPARISON: Partial<Record<BinaryOp, ComparisonCode>> = {
  '<': CMP.LT,
  '>': CMP.GT,
  '<=': CMP.LTEQ,
  '>=': CMP.GTEQ,
  '==': CMP.EQ,
  '!=': CMP.NEQ,
};
const INVERSE: Record<ComparisonCode, ComparisonCode> = {
  [CMP.LT]: CMP.GTEQ,
  [CMP.GT]: CMP.LTEQ,
  [CMP.LTEQ]: CMP.GT,
  [CMP.GTEQ]: CMP.LT,
  [CMP.EQ]: CMP.NEQ,
  [CMP.NEQ]: CMP.EQ,
};
const ARITHMETIC: Partial<Record<BinaryOp, number>> = {
  '+': OP.ADD,
  '-': OP.SUB,
  '*': OP.MUL,
  '/': OP.DIV,
  '%': OP.MOD,
};
const BUTTON_INDEX = { right: 1, left: 2, enter: 3 } as const;
/** Bytes reserved for a file when the File Access block does not say. */
const DEFAULT_FILE_SIZE = 1024;
/** I2C address and "read measurement byte 0" register of the ultrasonic sensor (Appendix 7). */
const US_ADDRESS = 0x02;
const US_READ_DISTANCE = 0x42;

const typeOf = (t: ValueType): DsType =>
  t === 'number' ? T.slong : t === 'boolean' ? T.ubyte : T.string;

/** Temporary items for one clump, reused statement by statement. */
class Temps {
  private pools: Record<ValueType, number[]> = { number: [], boolean: [], text: [] };
  private used: Record<ValueType, number> = { number: 0, boolean: 0, text: 0 };

  constructor(private readonly ds: Dataspace) {}

  get(type: ValueType): number {
    const pool = this.pools[type];
    const i = this.used[type]++;
    if (i >= pool.length)
      pool.push(this.ds.add(typeOf(type), type === 'text' ? [0] : undefined).id);
    return pool[i]!;
  }

  mark(): Record<ValueType, number> {
    return { ...this.used };
  }

  release(mark: Record<ValueType, number>): void {
    this.used = { ...mark };
  }
}

interface ClumpContext {
  index: number;
  code: CodeBuilder;
  temps: Temps;
  /** Exit labels of the loops being compiled, innermost last. */
  loops: Label[];
}

/**
 * Compiles a program to an .rxe file for the stock NXT firmware.
 *
 * Layout: clump 0 is the main beam; it sets up the sensors, then raises a "ready" flag.
 * Each parallel beam is its own clump that waits for that flag. Each My Block is a
 * subroutine clump (called with OP_SUBCALL, guarded by a mutex when more than one
 * clump calls it). Numbers are 32-bit integers (firmware 1.03 has no floating point),
 * logic values are bytes (0/1) and text is a zero-terminated byte array.
 */
export function compileProgram(program: IrProgram): Uint8Array {
  return compileWithSymbols(program).bytes;
}

/** Compiled program plus where each variable lives (dataspace item ids), for debugging. */
export interface CompiledProgram {
  bytes: Uint8Array;
  variables: Map<string, number>;
}

/** Like {@link compileProgram}, also returning each variable's dataspace item id. */
export function compileWithSymbols(program: IrProgram): CompiledProgram {
  const compiler = new Compiler(program);
  const bytes = compiler.compile();
  return { bytes, variables: compiler.variableIds() };
}

class Compiler {
  private readonly ds = new Dataspace();
  private readonly vars = new Map<string, { id: number; type: ValueType }>();
  private readonly constants = new Map<string, number>();
  private readonly clumps: { fireCount: number; code: number[] }[] = [];
  private readonly subroutines = new Map<
    string,
    { clump: number; caller: number; mutex?: number }
  >();
  private readonly syscalls = new Map<string, DsItem>();
  private ready!: number;
  private startTick!: number;

  constructor(private readonly program: IrProgram) {}

  compile(): Uint8Array {
    const p = this.program;
    for (const v of p.variables) {
      this.vars.set(v.name, {
        id: this.ds.add(typeOf(v.type), v.type === 'text' ? [0] : undefined).id,
        type: v.type,
      });
    }
    this.ready = this.ds.add(T.ubyte).id;
    this.startTick = this.ds.add(T.ulong).id;

    const lanes = [p.main, ...p.parallel];
    const firstSub = lanes.length;
    // Which clumps call each subroutine (a mutex is needed when more than one does).
    const callers = new Map<string, Set<number>>();
    const scan = (stmts: Stmt[], clump: number) =>
      walk(stmts, (s) => {
        if (s.kind === 'call') {
          const set = callers.get(s.name) ?? new Set<number>();
          set.add(clump);
          callers.set(s.name, set);
        }
      });
    lanes.forEach((body, i) => scan(body, i));
    p.subroutines.forEach((sub, i) => scan(sub.body, firstSub + i));
    p.subroutines.forEach((sub, i) => {
      const shared = (callers.get(sub.name)?.size ?? 0) > 1;
      this.subroutines.set(sub.name, {
        clump: firstSub + i,
        caller: this.ds.add(T.ubyte).id,
        ...(shared ? { mutex: this.ds.add(T.mutex).id } : {}),
      });
    });

    lanes.forEach((body, i) => {
      const ctx = this.context(i);
      if (i === 0) this.prologue(ctx);
      else this.waitForReady(ctx);
      this.block(ctx, body);
      ctx.code.emit(OP.FINCLUMP, [0xffff, 0xffff]);
      this.clumps.push({ fireCount: 0, code: ctx.code.finish() });
    });
    p.subroutines.forEach((sub, i) => {
      const ctx = this.context(firstSub + i);
      this.block(ctx, sub.body);
      ctx.code.emit(OP.SUBRET, [this.subroutines.get(sub.name)!.caller]);
      // Fire count 1 with no upstream clump: only ever started by OP_SUBCALL.
      this.clumps.push({ fireCount: 1, code: ctx.code.finish() });
    });

    return writeRxe({
      dataspace: this.ds,
      clumps: this.clumps.map((c) => ({ ...c, dependents: [] })),
    });
  }

  variableIds(): Map<string, number> {
    return new Map([...this.vars].map(([name, v]) => [name, v.id]));
  }

  private context(index: number): ClumpContext {
    return { index, code: new CodeBuilder(), temps: new Temps(this.ds), loops: [] };
  }

  // ---- Dataspace helpers -------------------------------------------------

  private num(value: number): number {
    const v = Math.trunc(value) | 0;
    const key = `n${v}`;
    let id = this.constants.get(key);
    if (id === undefined) {
      id = this.ds.add(T.slong, v).id;
      this.constants.set(key, id);
    }
    return id;
  }

  private byte(value: number): number {
    const key = `b${value & 0xff}`;
    let id = this.constants.get(key);
    if (id === undefined) {
      id = this.ds.add(T.ubyte, value & 0xff).id;
      this.constants.set(key, id);
    }
    return id;
  }

  private str(value: string): number {
    const key = `s${value}`;
    let id = this.constants.get(key);
    if (id === undefined) {
      id = this.ds.add(T.string, stringBytes(value)).id;
      this.constants.set(key, id);
    }
    return id;
  }

  /** A syscall parameter cluster, one per clump and call kind (clumps run in parallel). */
  private params(ctx: ClumpContext, name: string, type: DsType): DsItem {
    const key = `${ctx.index}:${name}`;
    let item = this.syscalls.get(key);
    if (!item) {
      item = this.ds.add(type);
      this.syscalls.set(key, item);
    }
    return item;
  }

  private field(item: DsItem, i: number): number {
    return item.fields[i]!.id;
  }

  // ---- Statements --------------------------------------------------------

  private prologue(ctx: ClumpContext): void {
    const c = ctx.code;
    const tick = this.params(ctx, 'starttick', T.cluster(T.ulong));
    c.emit(OP.SYSCALL, [SYSCALL.GetStartTick, tick.id]);
    c.emit(OP.MOV, [this.startTick, this.field(tick, 0)]);
    for (const [port, kind] of Object.entries(this.program.sensors)) {
      this.setupSensor(ctx, Number(port) as InputPort, kind);
    }
    c.emit(OP.MOV, [this.ready, this.byte(1)]);
  }

  private waitForReady(ctx: ClumpContext): void {
    const top = ctx.code.label();
    ctx.code.mark(top);
    ctx.code.brtst(CMP.EQ, top, this.ready);
  }

  private setupSensor(ctx: ClumpContext, port: InputPort, kind: SensorKind): void {
    const c = ctx.code;
    const [type, mode] = SENSOR_SETUP[kind];
    const p = this.byte(port);
    c.emit(OP.SETIN, [this.byte(type), p, IO_IN.TYPE]);
    c.emit(OP.SETIN, [this.byte(mode), p, IO_IN.MODE]);
    c.emit(OP.SETIN, [this.byte(1), p, IO_IN.INVALID_DATA]);
    // Wait until the firmware has applied the new type and mode.
    const wait = c.label();
    const flag = ctx.temps.get('boolean');
    c.mark(wait);
    c.emit(OP.GETIN, [flag, p, IO_IN.INVALID_DATA]);
    c.brtst(CMP.NEQ, wait, flag);
  }

  private block(ctx: ClumpContext, stmts: readonly Stmt[]): void {
    for (const s of stmts) {
      const mark = ctx.temps.mark();
      try {
        this.statement(ctx, s);
      } catch (error) {
        if (error instanceof CompileError) throw error;
        throw new CompileError(error instanceof Error ? error.message : String(error), s.source);
      }
      ctx.temps.release(mark);
    }
  }

  private statement(ctx: ClumpContext, s: Stmt): void {
    const c = ctx.code;
    switch (s.kind) {
      case 'motor':
        return this.motor(ctx, s);
      case 'motorStop': {
        const brake = s.mode === 'brake';
        this.setOut(ctx, s.ports, [
          [
            IO_OUT.MODE,
            this.byte(
              brake ? OUT_MODE.MOTORON | OUT_MODE.BRAKE | OUT_MODE.REGULATED : OUT_MODE.COAST,
            ),
          ],
          [IO_OUT.REG_MODE, this.byte(brake ? OUT_REGMODE.SPEED : OUT_REGMODE.IDLE)],
          [IO_OUT.RUN_STATE, this.byte(brake ? OUT_RUNSTATE.RUNNING : OUT_RUNSTATE.IDLE)],
          [IO_OUT.SPEED, this.byte(0)],
          [IO_OUT.FLAGS, this.byte(UF.UPDATE_MODE | UF.UPDATE_SPEED)],
        ]);
        return;
      }
      case 'resetMotor':
        this.setOut(
          ctx,
          [s.port],
          [[IO_OUT.FLAGS, this.byte(UF.UPDATE_RESET_ROTATION_COUNT | UF.UPDATE_RESET_BLOCK_COUNT)]],
        );
        return;
      case 'setSensor':
        return this.setupSensor(ctx, s.port, s.sensor);
      case 'tone': {
        const params = this.params(
          ctx,
          'tone',
          T.cluster(T.sbyte, T.uword, T.uword, T.ubyte, T.ubyte),
        );
        const duration = this.expr(ctx, s.durationMs, 'number');
        c.emit(OP.MOV, [this.field(params, 1), this.expr(ctx, s.frequency, 'number')]);
        c.emit(OP.MOV, [this.field(params, 2), duration]);
        c.emit(OP.MOV, [this.field(params, 3), this.byte(0)]);
        c.emit(OP.MOV, [this.field(params, 4), this.volume(ctx, s.volume)]);
        c.emit(OP.SYSCALL, [SYSCALL.SoundPlayTone, params.id]);
        if (s.wait) this.sleep(ctx, duration);
        return;
      }
      case 'soundFile': {
        const params = this.params(
          ctx,
          'soundfile',
          T.cluster(T.sbyte, T.string, T.ubyte, T.ubyte),
        );
        c.emit(OP.MOV, [this.field(params, 1), this.str(s.file)]);
        c.emit(OP.MOV, [this.field(params, 2), this.byte(s.loop ? 1 : 0)]);
        c.emit(OP.MOV, [this.field(params, 3), this.volume(ctx, s.volume)]);
        c.emit(OP.SYSCALL, [SYSCALL.SoundPlayFile, params.id]);
        if (s.wait) {
          // Wait until the sound module has no pending or running playback.
          const state = this.params(ctx, 'soundstate', T.cluster(T.ubyte, T.ubyte));
          const top = c.label();
          c.mark(top);
          c.emit(OP.SYSCALL, [SYSCALL.SoundGetState, state.id]);
          c.brtst(CMP.NEQ, top, this.field(state, 1));
        }
        return;
      }
      case 'stopSound': {
        const params = this.params(ctx, 'soundset', T.cluster(T.ubyte, T.ubyte, T.ubyte));
        c.emit(OP.MOV, [this.field(params, 1), this.byte(SOUND_STATE.STOP)]);
        c.emit(OP.MOV, [this.field(params, 2), this.byte(0)]);
        c.emit(OP.SYSCALL, [SYSCALL.SoundSetState, params.id]);
        return;
      }
      case 'clearScreen':
        // Drawing an empty text with option bit 0 set clears the screen.
        return this.drawText(ctx, this.num(0), this.num(0), this.str(''), 1);
      case 'drawText':
      case 'drawNumber': {
        const x = this.expr(ctx, s.x, 'number');
        const y = this.lineToY(ctx, s.line);
        const text =
          s.kind === 'drawText' ? this.expr(ctx, s.text, 'text') : this.expr(ctx, s.value, 'text');
        return this.drawText(ctx, x, y, text, 0);
      }
      case 'drawPoint': {
        const params = this.params(
          ctx,
          'point',
          T.cluster(T.sbyte, T.cluster(T.sword, T.sword), T.ulong),
        );
        const loc = params.fields[1]!;
        c.emit(OP.MOV, [this.field(loc, 0), this.expr(ctx, s.x, 'number')]);
        c.emit(OP.MOV, [this.field(loc, 1), this.expr(ctx, s.y, 'number')]);
        c.emit(OP.MOV, [this.field(params, 2), this.num(0)]);
        c.emit(OP.SYSCALL, [SYSCALL.DrawPoint, params.id]);
        return;
      }
      case 'drawLine': {
        const params = this.params(
          ctx,
          'line',
          T.cluster(T.sbyte, T.cluster(T.sword, T.sword), T.cluster(T.sword, T.sword), T.ulong),
        );
        const [from, to] = [params.fields[1]!, params.fields[2]!];
        c.emit(OP.MOV, [this.field(from, 0), this.expr(ctx, s.x, 'number')]);
        c.emit(OP.MOV, [this.field(from, 1), this.expr(ctx, s.y, 'number')]);
        c.emit(OP.MOV, [this.field(to, 0), this.expr(ctx, s.endX, 'number')]);
        c.emit(OP.MOV, [this.field(to, 1), this.expr(ctx, s.endY, 'number')]);
        c.emit(OP.MOV, [this.field(params, 3), this.num(0)]);
        c.emit(OP.SYSCALL, [SYSCALL.DrawLine, params.id]);
        return;
      }
      case 'drawCircle': {
        const params = this.params(
          ctx,
          'circle',
          T.cluster(T.sbyte, T.cluster(T.sword, T.sword), T.ubyte, T.ulong),
        );
        const center = params.fields[1]!;
        c.emit(OP.MOV, [this.field(center, 0), this.expr(ctx, s.x, 'number')]);
        c.emit(OP.MOV, [this.field(center, 1), this.expr(ctx, s.y, 'number')]);
        c.emit(OP.MOV, [this.field(params, 2), this.expr(ctx, s.radius, 'number')]);
        c.emit(OP.MOV, [this.field(params, 3), this.num(0)]);
        c.emit(OP.SYSCALL, [SYSCALL.DrawCircle, params.id]);
        return;
      }
      case 'drawImage': {
        const params = this.params(
          ctx,
          'picture',
          T.cluster(T.ubyte, T.cluster(T.sword, T.sword), T.string, T.array(TC.SLONG), T.ulong),
        );
        const loc = params.fields[1]!;
        c.emit(OP.MOV, [this.field(loc, 0), this.expr(ctx, s.x, 'number')]);
        c.emit(OP.MOV, [this.field(loc, 1), this.expr(ctx, s.y, 'number')]);
        c.emit(OP.MOV, [this.field(params, 2), this.str(s.file)]);
        c.emit(OP.MOV, [this.field(params, 4), this.num(0)]);
        c.emit(OP.SYSCALL, [SYSCALL.DrawPicture, params.id]);
        return;
      }
      case 'file':
        return this.file(ctx, s);
      case 'messageWrite':
        return this.messageWrite(ctx, s);
      case 'messageRead':
        return this.messageRead(ctx, s);
      case 'wait':
        return this.sleep(ctx, this.expr(ctx, s.ms, 'number'));
      case 'waitUntil': {
        const top = c.label();
        c.mark(top);
        const mark = ctx.temps.mark();
        this.branchUnless(ctx, s.condition, top);
        ctx.temps.release(mark);
        return;
      }
      case 'set': {
        const target = this.vars.get(s.name);
        if (!target) throw new CompileError(`Unknown variable "${s.name}"`, s.source);
        c.emit(OP.MOV, [target.id, this.expr(ctx, s.value, target.type)]);
        return;
      }
      case 'if': {
        const otherwise = c.label();
        const end = c.label();
        this.branchUnless(ctx, s.condition, otherwise);
        this.block(ctx, s.then);
        if (s.else.length) c.jmp(end);
        c.mark(otherwise);
        this.block(ctx, s.else);
        c.mark(end);
        return;
      }
      case 'while': {
        const top = c.label();
        const end = c.label();
        c.mark(top);
        this.branchUnless(ctx, s.condition, end);
        this.loopBody(ctx, s.body, end);
        c.jmp(top);
        c.mark(end);
        return;
      }
      case 'repeat': {
        // The counter is a dedicated item: temps are reused by the statements inside.
        const counter = this.ds.add(T.slong).id;
        const top = c.label();
        const end = c.label();
        c.emit(OP.MOV, [counter, this.expr(ctx, s.count, 'number')]);
        c.mark(top);
        c.brtst(CMP.LTEQ, end, counter);
        this.loopBody(ctx, s.body, end);
        c.emit(OP.SUB, [counter, counter, this.num(1)]);
        c.jmp(top);
        c.mark(end);
        return;
      }
      case 'forever': {
        const top = c.label();
        const end = c.label();
        c.mark(top);
        this.loopBody(ctx, s.body, end);
        c.jmp(top);
        c.mark(end);
        return;
      }
      case 'break': {
        const exit = ctx.loops[ctx.loops.length - 1];
        if (!exit) throw new CompileError('Break outside a loop', s.source);
        c.jmp(exit);
        return;
      }
      case 'call': {
        const sub = this.subroutines.get(s.name);
        if (!sub) throw new CompileError(`Unknown My Block "${s.name}"`, s.source);
        if (sub.mutex !== undefined) c.emit(OP.ACQUIRE, [sub.mutex]);
        c.emit(OP.SUBCALL, [sub.clump, sub.caller]);
        if (sub.mutex !== undefined) c.emit(OP.RELEASE, [sub.mutex]);
        return;
      }
      case 'stop':
        c.emit(OP.STOP, [NOT_A_DS_ID]);
        return;
    }
  }

  private loopBody(ctx: ClumpContext, body: readonly Stmt[], exit: Label): void {
    ctx.loops.push(exit);
    this.block(ctx, body);
    ctx.loops.pop();
  }

  /** NXT-G volume 0–100 as the firmware's 0–4. */
  private volume(ctx: ClumpContext, volume: Expr): number {
    if (volume.kind === 'number')
      return this.byte(Math.max(0, Math.min(4, Math.round(volume.value / 25))));
    const t = ctx.temps.get('number');
    ctx.code.emit(OP.ADD, [t, this.expr(ctx, volume, 'number'), this.num(12)]);
    ctx.code.emit(OP.DIV, [t, t, this.num(25)]);
    return t;
  }

  /** Busy-waits `ms` milliseconds (an item holding a number). */
  private sleep(ctx: ClumpContext, ms: number): void {
    const c = ctx.code;
    const end = ctx.temps.get('number');
    const now = ctx.temps.get('number');
    c.emit(OP.GETTICK, [end]);
    c.emit(OP.ADD, [end, end, ms]);
    const top = c.label();
    c.mark(top);
    c.emit(OP.GETTICK, [now]);
    c.brcmp(CMP.LT, top, now, end);
  }

  /** Pixel y of text line 1–8 (line 1 is the top: y = 56). */
  private lineToY(ctx: ClumpContext, line: Expr): number {
    if (line.kind === 'number') return this.num((8 - line.value) * 8);
    const t = ctx.temps.get('number');
    ctx.code.emit(OP.SUB, [t, this.num(8), this.expr(ctx, line, 'number')]);
    ctx.code.emit(OP.MUL, [t, t, this.num(8)]);
    return t;
  }

  private drawText(ctx: ClumpContext, x: number, y: number, text: number, options: number): void {
    const c = ctx.code;
    const params = this.params(
      ctx,
      'text',
      T.cluster(T.sbyte, T.cluster(T.sword, T.sword), T.string, T.ulong),
    );
    const loc = params.fields[1]!;
    c.emit(OP.MOV, [this.field(loc, 0), x]);
    c.emit(OP.MOV, [this.field(loc, 1), y]);
    c.emit(OP.MOV, [this.field(params, 2), text]);
    c.emit(OP.MOV, [this.field(params, 3), this.num(options)]);
    c.emit(OP.SYSCALL, [SYSCALL.DrawText, params.id]);
  }

  /** OP_SETOUT on one port or a list of ports. */
  private setOut(ctx: ClumpContext, ports: readonly OutputPort[], props: [number, number][]): void {
    const target =
      ports.length === 1
        ? this.byte(ports[0]!)
        : (() => {
            const key = `p${ports.join(',')}`;
            let id = this.constants.get(key);
            if (id === undefined) {
              id = this.ds.add(T.array(TC.UBYTE), [...ports]).id;
              this.constants.set(key, id);
            }
            return id;
          })();
    ctx.code.emitVariable(OP.SETOUT, [target, ...props.flat()]);
  }

  private motor(ctx: ClumpContext, s: Extract<Stmt, { kind: 'motor' }>): void {
    const c = ctx.code;
    const synced = s.ports.length === 2;
    const power = this.expr(ctx, s.power, 'number');
    const ratio = synced ? this.expr(ctx, s.turnRatio, 'number') : this.num(0);
    const brake = s.then === 'brake' ? OUT_MODE.BRAKE : 0;
    const regulated = synced || s.regulated;
    const mode = OUT_MODE.MOTORON | brake | (regulated ? OUT_MODE.REGULATED : 0);
    const regMode = synced ? OUT_REGMODE.SYNC : s.regulated ? OUT_REGMODE.SPEED : OUT_REGMODE.IDLE;
    let limit = this.num(0);
    let flags = UF.UPDATE_MODE | UF.UPDATE_SPEED | UF.UPDATE_TACHO_LIMIT;
    if (s.degrees) {
      limit = ctx.temps.get('number');
      const degrees = this.expr(ctx, s.degrees, 'number');
      // TACH_LIMIT is unsigned: the direction comes from the sign of the power.
      const positive = c.label();
      c.emit(OP.MOV, [limit, degrees]);
      c.brtst(CMP.GTEQ, positive, limit);
      c.emit(OP.NEG, [limit, limit]);
      c.mark(positive);
      flags |= UF.UPDATE_RESET_COUNT;
    }
    this.setOut(ctx, s.ports, [
      [IO_OUT.MODE, this.byte(mode)],
      [IO_OUT.REG_MODE, this.byte(regMode)],
      [IO_OUT.RUN_STATE, this.byte(OUT_RUNSTATE.RUNNING)],
      [IO_OUT.SPEED, power],
      [IO_OUT.TURN_RATIO, ratio],
      [IO_OUT.TACH_LIMIT, limit],
      [IO_OUT.FLAGS, this.byte(flags)],
    ]);
    if (s.degrees && s.wait) {
      // Give the output module a moment to take the new goal, then wait until every
      // port's run state drops back to idle (the goal is reached).
      this.sleep(ctx, this.num(2));
      const state = ctx.temps.get('number');
      for (const port of s.ports) {
        const top = c.label();
        c.mark(top);
        c.emit(OP.GETOUT, [state, this.byte(port), IO_OUT.RUN_STATE]);
        c.brtst(CMP.NEQ, top, state);
      }
    }
  }

  // ---- Files and messages ------------------------------------------------

  /** Looks up an open handle for `name`; leaves status (0 = found), handle and write flag. */
  private resolve(ctx: ClumpContext, name: number): DsItem {
    const params = this.params(ctx, 'fresolve', T.cluster(T.uword, T.ubyte, T.ubyte, T.string));
    ctx.code.emit(OP.MOV, [this.field(params, 3), name]);
    ctx.code.emit(OP.SYSCALL, [SYSCALL.FileResolveHandle, params.id]);
    return params;
  }

  private file(ctx: ClumpContext, s: Extract<Stmt, { kind: 'file' }>): void {
    const c = ctx.code;
    const name = this.expr(ctx, s.file, 'text');
    const resolved = this.resolve(ctx, name);
    const handle = ctx.temps.get('number');
    const status = this.field(resolved, 0);
    const done = c.label();
    switch (s.action) {
      case 'close':
      case 'delete': {
        const notOpen = c.label();
        c.brtst(CMP.NEQ, notOpen, status);
        const close = this.params(ctx, 'fclose', T.cluster(T.uword, T.ubyte));
        c.emit(OP.MOV, [this.field(close, 1), this.field(resolved, 1)]);
        c.emit(OP.SYSCALL, [SYSCALL.FileClose, close.id]);
        c.mark(notOpen);
        if (s.action === 'delete') {
          const del = this.params(ctx, 'fdelete', T.cluster(T.uword, T.string));
          c.emit(OP.MOV, [this.field(del, 1), name]);
          c.emit(OP.SYSCALL, [SYSCALL.FileDelete, del.id]);
        }
        c.mark(done);
        return;
      }
      case 'write': {
        // Open for writing unless already open; append when the file exists.
        const open = this.params(ctx, 'fopen', T.cluster(T.uword, T.ubyte, T.string, T.ulong));
        const have = c.label();
        const opened = c.label();
        c.emit(OP.MOV, [handle, this.field(resolved, 1)]);
        c.brtst(CMP.NEQ, opened, status);
        c.brtst(CMP.NEQ, have, this.field(resolved, 2));
        c.mark(opened);
        c.emit(OP.MOV, [this.field(open, 2), name]);
        c.emit(OP.MOV, [
          this.field(open, 3),
          s.size ? this.sizeOrDefault(ctx, s.size) : this.num(DEFAULT_FILE_SIZE),
        ]);
        c.emit(OP.SYSCALL, [SYSCALL.FileOpenWrite, open.id]);
        const created = c.label();
        c.brtst(CMP.EQ, created, this.field(open, 0));
        c.emit(OP.SYSCALL, [SYSCALL.FileOpenAppend, open.id]);
        c.mark(created);
        c.emit(OP.MOV, [handle, this.field(open, 1)]);
        c.mark(have);
        const write = this.params(ctx, 'fwrite', T.cluster(T.uword, T.ubyte, T.string, T.ulong));
        const line = ctx.temps.get('text');
        c.emitVariable(OP.STRCAT, [
          line,
          this.expr(ctx, s.value ?? { kind: 'text', value: '' }, 'text'),
          this.str('\r\n'),
        ]);
        c.emit(OP.MOV, [this.field(write, 1), handle]);
        c.emit(OP.MOV, [this.field(write, 2), line]);
        c.emit(OP.ARRSIZE, [this.field(write, 3), line]);
        c.emit(OP.SUB, [this.field(write, 3), this.field(write, 3), this.num(1)]);
        c.emit(OP.SYSCALL, [SYSCALL.FileWrite, write.id]);
        c.mark(done);
        return;
      }
      case 'read': {
        const open = this.params(ctx, 'fopenr', T.cluster(T.uword, T.ubyte, T.string, T.ulong));
        const have = c.label();
        const fail = c.label();
        const error = s.error ? this.vars.get(s.error) : undefined;
        if (s.error && !error) throw new CompileError(`Unknown variable "${s.error}"`, s.source);
        if (error) c.emit(OP.MOV, [error.id, this.byte(0)]);
        c.emit(OP.MOV, [handle, this.field(resolved, 1)]);
        const openNow = c.label();
        c.brtst(CMP.NEQ, openNow, status);
        c.brtst(CMP.EQ, have, this.field(resolved, 2));
        c.mark(openNow);
        c.emit(OP.MOV, [this.field(open, 2), name]);
        c.emit(OP.SYSCALL, [SYSCALL.FileOpenRead, open.id]);
        c.brtst(CMP.NEQ, fail, this.field(open, 0));
        c.emit(OP.MOV, [handle, this.field(open, 1)]);
        c.mark(have);
        // Read one line, a byte at a time, up to the line feed.
        const read = this.params(ctx, 'fread', T.cluster(T.uword, T.ubyte, T.string, T.ulong));
        const text = ctx.temps.get('text');
        const ch = ctx.temps.get('number');
        const top = c.label();
        const end = c.label();
        c.emit(OP.MOV, [text, this.str('')]);
        c.mark(top);
        c.emit(OP.MOV, [this.field(read, 1), handle]);
        c.emit(OP.MOV, [this.field(read, 3), this.num(1)]);
        c.emit(OP.SYSCALL, [SYSCALL.FileRead, read.id]);
        c.brtst(CMP.NEQ, end, this.field(read, 0));
        c.brtst(CMP.EQ, end, this.field(read, 3));
        c.emit(OP.INDEX, [ch, this.field(read, 2), NOT_A_DS_ID]);
        c.brcmp(CMP.EQ, end, ch, this.num(10));
        c.brcmp(CMP.EQ, top, ch, this.num(13));
        c.emitVariable(OP.STRCAT, [text, text, this.field(read, 2)]);
        c.jmp(top);
        c.mark(fail);
        // The file could not be opened.
        if (error) c.emit(OP.MOV, [error.id, this.byte(1)]);
        c.mark(end);
        if (s.target) {
          const target = this.vars.get(s.target);
          if (!target) throw new CompileError(`Unknown variable "${s.target}"`, s.source);
          if (target.type === 'text') c.emit(OP.MOV, [target.id, text]);
          else {
            const past = ctx.temps.get('number');
            c.emit(OP.STRINGTONUM, [target.id, past, text, NOT_A_DS_ID, NOT_A_DS_ID]);
          }
        }
        c.mark(done);
        return;
      }
    }
  }

  private sizeOrDefault(ctx: ClumpContext, size: Expr): number {
    if (size.kind === 'number') return this.num(size.value > 0 ? size.value : DEFAULT_FILE_SIZE);
    const t = ctx.temps.get('number');
    const ok = ctx.code.label();
    ctx.code.emit(OP.MOV, [t, this.expr(ctx, size, 'number')]);
    ctx.code.brtst(CMP.GT, ok, t);
    ctx.code.emit(OP.MOV, [t, this.num(DEFAULT_FILE_SIZE)]);
    ctx.code.mark(ok);
    return t;
  }

  /** A message as bytes: text as is, numbers as 4 flattened bytes, logic as one byte. */
  private messageText(ctx: ClumpContext, value: Expr, type: ValueType): number {
    const v = this.expr(ctx, value, type);
    if (type === 'text') return v;
    const t = ctx.temps.get('text');
    ctx.code.emit(OP.FLATTEN, [t, v]);
    return t;
  }

  private messageWrite(ctx: ClumpContext, s: Extract<Stmt, { kind: 'messageWrite' }>): void {
    const c = ctx.code;
    const text = this.messageText(ctx, s.value, s.valueType);
    const box = ctx.temps.get('number');
    c.emit(OP.SUB, [box, this.expr(ctx, s.mailbox, 'number'), this.num(1)]);
    if (s.connection === 0) {
      // From a slave brick to the master: the master collects outboxes 10–19.
      const params = this.params(ctx, 'msgwrite', T.cluster(T.sbyte, T.ubyte, T.string));
      c.emit(OP.ADD, [this.field(params, 1), box, this.num(10)]);
      c.emit(OP.MOV, [this.field(params, 2), text]);
      c.emit(OP.SYSCALL, [SYSCALL.MessageWrite, params.id]);
      return;
    }
    // To a slave: send a MessageWrite direct command (0x80 0x09 inbox size data).
    const size = ctx.temps.get('number');
    c.emit(OP.ARRSIZE, [size, text]);
    const packet = this.params(ctx, 'btpacket', T.array(TC.UBYTE));
    c.emitVariable(OP.ARRBUILD, [packet.id, this.byte(0x80), this.byte(0x09), box, size, text]);
    const params = this.params(ctx, 'btwrite', T.cluster(T.sbyte, T.ubyte, T.array(TC.UBYTE)));
    c.emit(OP.MOV, [this.field(params, 1), this.byte(s.connection)]);
    c.emit(OP.MOV, [this.field(params, 2), packet.id]);
    c.emit(OP.SYSCALL, [SYSCALL.CommBTWrite, params.id]);
    // Wait while the connection is busy (status 32 = pending).
    const check = this.params(ctx, 'btcheck', T.cluster(T.sbyte, T.ubyte));
    const top = c.label();
    c.emit(OP.MOV, [this.field(check, 1), this.byte(s.connection)]);
    c.mark(top);
    c.emit(OP.SYSCALL, [SYSCALL.CommBTCheckStatus, check.id]);
    c.brcmp(CMP.EQ, top, this.field(check, 0), this.num(32));
  }

  private messageRead(ctx: ClumpContext, s: Extract<Stmt, { kind: 'messageRead' }>): void {
    const c = ctx.code;
    const target = this.vars.get(s.target);
    const received = this.vars.get(s.received);
    if (!target || !received) throw new CompileError('Unknown message variable', s.source);
    const params = this.params(ctx, 'msgread', T.cluster(T.sbyte, T.ubyte, T.ubyte, T.string));
    c.emit(OP.SUB, [this.field(params, 1), this.expr(ctx, s.mailbox, 'number'), this.num(1)]);
    c.emit(OP.MOV, [this.field(params, 2), this.byte(1)]);
    c.emit(OP.SYSCALL, [SYSCALL.MessageRead, params.id]);
    c.emit(OP.TST, [received.id, this.field(params, 0)], CMP.EQ);
    const none = c.label();
    c.brtst(CMP.NEQ, none, this.field(params, 0));
    const message = this.field(params, 3);
    if (s.valueType === 'text') c.emit(OP.MOV, [target.id, message]);
    else if (s.valueType === 'boolean') {
      const b = ctx.temps.get('number');
      c.emit(OP.INDEX, [b, message, NOT_A_DS_ID]);
      c.emit(OP.TST, [target.id, b], CMP.NEQ);
    } else {
      const error = ctx.temps.get('boolean');
      c.emit(OP.UNFLATTEN, [target.id, error, message, this.num(0)]);
    }
    c.mark(none);
  }

  // ---- Expressions -------------------------------------------------------

  private typeOfExpr(e: Expr): ValueType {
    switch (e.kind) {
      case 'number':
      case 'random':
      case 'sensor':
      case 'motorDegrees':
      case 'tick':
        return 'number';
      case 'boolean':
      case 'not':
      case 'button':
        return 'boolean';
      case 'text':
      case 'numberToText':
      case 'concat':
        return 'text';
      case 'var':
        return this.vars.get(e.name)?.type ?? 'number';
      case 'choose':
        return this.typeOfExpr(e.then);
      case 'binary':
        return e.op in ARITHMETIC ? 'number' : 'boolean';
    }
  }

  /** Compiles an expression; returns the dataspace item holding its value as `want`. */
  private expr(ctx: ClumpContext, e: Expr, want: ValueType): number {
    const have = this.typeOfExpr(e);
    const id = this.value(ctx, e);
    if (have === want || (have !== 'text' && want !== 'text')) return id;
    const t = ctx.temps.get(want);
    if (want === 'text') ctx.code.emit(OP.NUMTOSTRING, [t, id]);
    else {
      const past = ctx.temps.get('number');
      ctx.code.emit(OP.STRINGTONUM, [t, past, id, NOT_A_DS_ID, NOT_A_DS_ID]);
    }
    return t;
  }

  private value(ctx: ClumpContext, e: Expr): number {
    const c = ctx.code;
    switch (e.kind) {
      case 'number':
        return this.num(e.value);
      case 'boolean':
        return this.byte(e.value ? 1 : 0);
      case 'text':
        return this.str(e.value);
      case 'var': {
        const v = this.vars.get(e.name);
        if (!v) throw new CompileError(`Unknown variable "${e.name}"`);
        return v.id;
      }
      case 'not': {
        const t = ctx.temps.get('boolean');
        c.emit(OP.NOT, [t, this.expr(ctx, e.operand, 'boolean')]);
        return t;
      }
      case 'binary': {
        const arithmetic = ARITHMETIC[e.op];
        if (arithmetic !== undefined) {
          const t = ctx.temps.get('number');
          c.emit(arithmetic, [
            t,
            this.expr(ctx, e.left, 'number'),
            this.expr(ctx, e.right, 'number'),
          ]);
          return t;
        }
        if (e.op === 'and' || e.op === 'or') {
          const t = ctx.temps.get('boolean');
          c.emit(e.op === 'and' ? OP.AND : OP.OR, [
            t,
            this.expr(ctx, e.left, 'boolean'),
            this.expr(ctx, e.right, 'boolean'),
          ]);
          return t;
        }
        const t = ctx.temps.get('boolean');
        const [l, r] = this.operands(ctx, e.left, e.right);
        c.emit(OP.CMP, [t, l, r], COMPARISON[e.op]!);
        return t;
      }
      case 'random': {
        // min + |r| mod (max − min + 1), r from the firmware's 16-bit generator.
        const params = this.params(ctx, 'random', T.cluster(T.sword));
        const min = this.expr(ctx, e.min, 'number');
        const range = ctx.temps.get('number');
        const t = ctx.temps.get('number');
        const positive = c.label();
        c.emit(OP.SUB, [range, this.expr(ctx, e.max, 'number'), min]);
        c.emit(OP.ADD, [range, range, this.num(1)]);
        c.emit(OP.SYSCALL, [SYSCALL.RandomNumber, params.id]);
        c.emit(OP.MOV, [t, this.field(params, 0)]);
        c.brtst(CMP.GTEQ, positive, t);
        c.emit(OP.NEG, [t, t]);
        c.mark(positive);
        c.emit(OP.MOD, [t, t, range]);
        c.emit(OP.ADD, [t, t, min]);
        return t;
      }
      case 'sensor':
        return this.readSensor(ctx, e.port);
      case 'motorDegrees': {
        const t = ctx.temps.get('number');
        c.emit(OP.GETOUT, [t, this.byte(e.port), IO_OUT.ROTATION_COUNT]);
        return t;
      }
      case 'tick': {
        const t = ctx.temps.get('number');
        c.emit(OP.GETTICK, [t]);
        c.emit(OP.SUB, [t, t, this.startTick]);
        return t;
      }
      case 'button': {
        const params = this.params(
          ctx,
          'button',
          T.cluster(T.sbyte, T.ubyte, T.ubyte, T.ubyte, T.ubyte),
        );
        c.emit(OP.MOV, [this.field(params, 1), this.byte(BUTTON_INDEX[e.button])]);
        c.emit(OP.MOV, [this.field(params, 4), this.byte(0)]);
        c.emit(OP.SYSCALL, [SYSCALL.ReadButton, params.id]);
        const t = ctx.temps.get('boolean');
        c.emit(OP.TST, [t, this.field(params, 2)], CMP.NEQ);
        return t;
      }
      case 'choose': {
        const type = this.typeOfExpr(e.then);
        const t = ctx.temps.get(type);
        const otherwise = c.label();
        const end = c.label();
        this.branchUnless(ctx, e.condition, otherwise);
        c.emit(OP.MOV, [t, this.expr(ctx, e.then, type)]);
        c.jmp(end);
        c.mark(otherwise);
        c.emit(OP.MOV, [t, this.expr(ctx, e.else, type)]);
        c.mark(end);
        return t;
      }
      case 'numberToText': {
        const t = ctx.temps.get('text');
        c.emit(OP.NUMTOSTRING, [t, this.expr(ctx, e.value, 'number')]);
        return t;
      }
      case 'concat': {
        const parts = e.parts.map((p) => this.expr(ctx, p, 'text'));
        const t = ctx.temps.get('text');
        c.emitVariable(OP.STRCAT, [t, ...parts]);
        return t;
      }
    }
  }

  /** Both sides of a comparison, converted to a common type (text wins). */
  private operands(ctx: ClumpContext, left: Expr, right: Expr): [number, number] {
    const text = this.typeOfExpr(left) === 'text' || this.typeOfExpr(right) === 'text';
    const want: ValueType = text ? 'text' : 'number';
    return [this.expr(ctx, left, want), this.expr(ctx, right, want)];
  }

  /** Jumps to `target` when the condition is false. */
  private branchUnless(ctx: ClumpContext, condition: Expr, target: Label): void {
    if (condition.kind === 'binary') {
      const cmp = COMPARISON[condition.op];
      if (cmp !== undefined) {
        const [l, r] = this.operands(ctx, condition.left, condition.right);
        ctx.code.brcmp(INVERSE[cmp], target, l, r);
        return;
      }
    }
    if (condition.kind === 'not') {
      ctx.code.brtst(CMP.NEQ, target, this.expr(ctx, condition.operand, 'boolean'));
      return;
    }
    ctx.code.brtst(CMP.EQ, target, this.expr(ctx, condition, 'boolean'));
  }

  private readSensor(ctx: ClumpContext, port: InputPort): number {
    const c = ctx.code;
    const t = ctx.temps.get('number');
    if (this.program.sensors[port] !== 'ultrasonic') {
      c.emit(OP.GETIN, [t, this.byte(port), IO_IN.SCALED_VAL]);
      return t;
    }
    // Ultrasonic: ask for "measurement byte 0" over I2C, wait, then read one byte.
    const write = this.params(
      ctx,
      `lswrite${port}`,
      T.cluster(T.sbyte, T.ubyte, T.array(TC.UBYTE), T.ubyte),
    );
    const status = this.params(ctx, `lsstatus${port}`, T.cluster(T.sbyte, T.ubyte, T.ubyte));
    const read = this.params(
      ctx,
      `lsread${port}`,
      T.cluster(T.sbyte, T.ubyte, T.array(TC.UBYTE), T.ubyte),
    );
    const request =
      this.constants.get('usreq') ??
      this.ds.add(T.array(TC.UBYTE), [US_ADDRESS, US_READ_DISTANCE]).id;
    this.constants.set('usreq', request);
    const p = this.byte(port);
    const wait = c.label();
    const failed = c.label();
    const done = c.label();
    c.emit(OP.MOV, [this.field(write, 1), p]);
    c.emit(OP.MOV, [this.field(write, 2), request]);
    c.emit(OP.MOV, [this.field(write, 3), this.byte(1)]);
    c.emit(OP.SYSCALL, [SYSCALL.CommLSWrite, write.id]);
    c.emit(OP.MOV, [this.field(status, 1), p]);
    c.mark(wait);
    c.emit(OP.SYSCALL, [SYSCALL.CommLSCheckStatus, status.id]);
    c.brcmp(CMP.EQ, wait, this.field(status, 0), this.num(32));
    c.brtst(CMP.NEQ, failed, this.field(status, 0));
    c.emit(OP.MOV, [this.field(read, 1), p]);
    c.emit(OP.MOV, [this.field(read, 3), this.byte(1)]);
    c.emit(OP.SYSCALL, [SYSCALL.CommLSRead, read.id]);
    c.brtst(CMP.NEQ, failed, this.field(read, 0));
    c.emit(OP.INDEX, [t, this.field(read, 2), NOT_A_DS_ID]);
    c.jmp(done);
    c.mark(failed);
    c.emit(OP.MOV, [t, this.num(255)]);
    c.mark(done);
    return t;
  }
}

function walk(stmts: readonly Stmt[], fn: (s: Stmt) => void): void {
  for (const s of stmts) {
    fn(s);
    if (s.kind === 'if') {
      walk(s.then, fn);
      walk(s.else, fn);
    } else if (s.kind === 'while' || s.kind === 'repeat' || s.kind === 'forever') walk(s.body, fn);
  }
}
