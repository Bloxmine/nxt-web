import { LoweringError, lowerProgram, wireVariable } from '@nxt/blocks';
import { formatNumber, scenarioById, Simulation, type SimStatus, type Value } from '@nxt/sim';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useEditor } from '../editor/EditorContext';
import { SimAudio } from './audio';

/** What the editor needs to show the debugger: running blocks, breakpoints, wire values. */
export interface DebugView {
  /** Blocks a task is running right now (empty when not simulating). */
  active: ReadonlySet<string>;
  breakpoints: ReadonlySet<string>;
  toggleBreakpoint(blockId: string): void;
}

/** Simulator controls and state for the simulator window. */
export interface SimulatorControls {
  open: boolean;
  setOpen(open: boolean): void;
  /** The current simulation (rebuilt when the program changes and it is not running). */
  sim: Simulation | null;
  status: SimStatus;
  /** True when the program changed after the running simulation was built. */
  stale: boolean;
  /** Problems that stop the program from running (same as Download would report). */
  problems: string[];
  speed: number;
  setSpeed(speed: number): void;
  scenarioId: string;
  setScenario(id: string): void;
  audio: SimAudio;
  run(): void;
  pause(): void;
  step(): void;
  /** Stops and resets the program and the robot. */
  reset(): void;
  toggleBreakpoint(blockId: string): void;
  /** Re-renders the read-outs (after changing something outside React state). */
  refresh(): void;
  /** Increases about ten times a second while running, for read-outs to refresh. */
  tick: number;
}

const DebugContext = createContext<DebugView>({
  active: new Set(),
  breakpoints: new Set(),
  toggleBreakpoint: () => {},
});
const WireValuesContext = createContext<ReadonlyMap<string, string> | null>(null);
const SimContext = createContext<SimulatorControls | null>(null);

/** Debugger state for blocks and wires in the editor. */
export function useDebugView(): DebugView {
  return useContext(DebugContext);
}

/** Current value carried by each data wire while simulating (refreshes often). */
export function useWireValues(): ReadonlyMap<string, string> | null {
  return useContext(WireValuesContext);
}

/** Simulator controls; only inside {@link SimulatorProvider}. */
export function useSimulator(): SimulatorControls {
  const value = useContext(SimContext);
  if (!value) throw new Error('useSimulator must be used inside SimulatorProvider');
  return value;
}

/** Shows a variable's value briefly, as on a wire label. */
export function formatValue(v: Value | undefined): string {
  if (v === undefined) return '';
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return v.length > 14 ? `"${v.slice(0, 13)}…"` : `"${v}"`;
}

/** Runs the simulation loop and shares its state with the editor and the simulator window. */
export function SimulatorProvider({
  children,
  initialScenario = 'empty',
}: {
  children: ReactNode;
  /** Mat to start with (read once). */
  initialScenario?: string;
}) {
  const { state } = useEditor();
  const program = state.program;
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [scenarioId, setScenarioId] = useState(initialScenario);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [builtFrom, setBuiltFrom] = useState<typeof program | null>(null);
  const [status, setStatus] = useState<SimStatus>('ready');
  const [problems, setProblems] = useState<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());
  const [tick, setTick] = useState(0);
  const audio = useMemo(() => new SimAudio(), []);
  const speedRef = useRef(speed);
  const frame = useRef(0);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const stale = sim !== null && builtFrom !== program;

  /** Copies the simulation's state into React state (cheap when nothing changed). */
  const sync = useCallback((s: Simulation) => {
    setStatus(s.status);
    const blocks = s.activeBlocks().map((a) => a.block);
    setActive((prev) =>
      prev.size === blocks.length && blocks.every((b) => prev.has(b)) ? prev : new Set(blocks),
    );
    setTick((t) => t + 1);
  }, []);

  /** A simulation of the current program, or null (with problems listed) if it has errors. */
  const build = useCallback((): Simulation | null => {
    try {
      const ir = lowerProgram(program);
      const next = new Simulation(ir, scenarioById(scenarioId));
      for (const b of breakpoints) next.breakpoints.add(b);
      next.on((event) => audio.handle(event, speedRef.current));
      setSim(next);
      setBuiltFrom(program);
      setProblems([]);
      return next;
    } catch (error) {
      setProblems(
        error instanceof LoweringError
          ? error.issues.map((i) => i.message)
          : [error instanceof Error ? error.message : String(error)],
      );
      return null;
    }
  }, [program, scenarioId, breakpoints, audio]);

  // The animation loop: advances simulated time in step with the clock while running.
  useEffect(() => {
    if (!sim || status !== 'running') return;
    let last = performance.now();
    let lastSync = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(100, now - last);
      last = now;
      sim.advance(elapsed * speedRef.current);
      if (sim.status !== 'running' || now - lastSync > 100) {
        lastSync = now;
        sync(sim);
      }
      if (sim.status === 'running') frame.current = requestAnimationFrame(loop);
      else if (sim.status === 'paused') {
        audio.stop();
        // Bring the block the program stopped at into view.
        requestAnimationFrame(() =>
          document
            .querySelector('.sim-active')
            ?.scrollIntoView({ block: 'nearest', inline: 'nearest' }),
        );
      }
    };
    frame.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame.current);
  }, [sim, status, sync, audio]);

  const current = useCallback(
    () => (sim && !(stale && sim.status !== 'running' && sim.status !== 'paused') ? sim : build()),
    [sim, stale, build],
  );

  const toggleBreakpoint = useCallback(
    (blockId: string) => {
      setBreakpoints((prev) => {
        const next = new Set(prev);
        if (next.has(blockId)) next.delete(blockId);
        else next.add(blockId);
        return next;
      });
      if (sim) {
        if (sim.breakpoints.has(blockId)) sim.breakpoints.delete(blockId);
        else sim.breakpoints.add(blockId);
      }
    },
    [sim],
  );

  const controls: SimulatorControls = {
    open,
    setOpen,
    sim,
    status,
    stale,
    problems,
    speed,
    setSpeed,
    scenarioId,
    setScenario: (id) => {
      setScenarioId(id);
      audio.stop();
      setSim(null);
      setStatus('ready');
      setActive(new Set());
    },
    audio,
    run: () => {
      audio.unlock();
      const s = current();
      if (!s) return;
      s.start();
      sync(s);
    },
    pause: () => {
      if (!sim) return;
      sim.pause();
      audio.stop();
      sync(sim);
    },
    step: () => {
      audio.unlock();
      const s = current();
      if (!s) return;
      s.step(0);
      sync(s);
    },
    reset: () => {
      audio.stop();
      if (!sim || stale) {
        build();
        setStatus('ready');
        setActive(new Set());
        return;
      }
      sim.reset();
      sync(sim);
    },
    toggleBreakpoint,
    refresh: () => setTick((t) => t + 1),
    tick,
  };

  // Wire values refresh with `tick`; reading them is cheap (one map lookup per wire).
  const wireValues = useMemo(() => {
    if (!sim || stale || sim.status === 'ready') return null;
    void tick;
    const vars = sim.variables();
    return new Map(
      program.wires.map((w) => [
        w.id,
        formatValue(vars.get(wireVariable(w.from.block, w.from.plug))),
      ]),
    );
  }, [sim, stale, tick, program.wires]);

  const debug = useMemo<DebugView>(
    () => ({
      active: open ? active : new Set(),
      breakpoints,
      toggleBreakpoint,
    }),
    [open, active, breakpoints, toggleBreakpoint],
  );

  return (
    <SimContext.Provider value={controls}>
      <DebugContext.Provider value={debug}>
        <WireValuesContext.Provider value={open ? wireValues : null}>
          {children}
        </WireValuesContext.Provider>
      </DebugContext.Provider>
    </SimContext.Provider>
  );
}
