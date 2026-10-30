import { LoweringError, lowerProgram, wireVariable, type Program } from '@nxt/blocks';
import {
  BrickPair,
  challengeById,
  ChallengeJudge,
  formatNumber,
  SCENARIOS,
  scenarioById,
  secondStart,
  Simulation,
  type Challenge,
  type ChallengeResult,
  type Scenario,
  type SimStatus,
  type Value,
} from '@nxt/sim';
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
import { deleteMat as removeMat, listMats, saveMat as storeMat } from '../lib/mats';
import { loadRobot, ROBOT_CHANGED, robotGeometry } from '../lib/robot';
import { SimAudio } from './audio';
import { recordScore } from './scores';

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
  /** The mat in use. */
  scenario: Scenario;
  /** Built-in mats followed by the user's own. */
  scenarios: Scenario[];
  customMats: Scenario[];
  saveMat(mat: Scenario): Promise<void>;
  deleteMat(id: string): Promise<void>;
  /** The second simulated brick, if one is on the mat. */
  sim2: Simulation | null;
  status2: SimStatus | null;
  second: SecondBrick;
  setSecond(second: SecondBrick): void;
  /** Name of the program on the second brick. */
  secondName: string | null;
  /** The challenge being played, if any. */
  challenge: Challenge | null;
  setChallenge(id: string | null): void;
  result: ChallengeResult | null;
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

/** What runs on the second brick: a copy of this program, or another program. */
export type SecondBrick =
  null | { kind: 'same' } | { kind: 'program'; name: string; program: Program };

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
  const [customMats, setCustomMats] = useState<Scenario[]>([]);
  const [robot, setRobot] = useState(() => robotGeometry(loadRobot()));
  const [second, setSecondBrick] = useState<SecondBrick>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [sim, setSim] = useState<Simulation | null>(null);
  const [sim2, setSim2] = useState<Simulation | null>(null);
  const [builtFrom, setBuiltFrom] = useState<typeof program | null>(null);
  const [status, setStatus] = useState<SimStatus>('ready');
  const [status2, setStatus2] = useState<SimStatus | null>(null);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [breakpoints, setBreakpoints] = useState<ReadonlySet<string>>(new Set());
  const [active, setActive] = useState<ReadonlySet<string>>(new Set());
  const [tick, setTick] = useState(0);
  const audio = useMemo(() => new SimAudio(), []);
  const speedRef = useRef(speed);
  const frame = useRef(0);
  const pair = useRef<BrickPair | null>(null);
  const judge = useRef<ChallengeJudge | null>(null);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    let live = true;
    void listMats().then((mats) => live && setCustomMats(mats));
    return () => {
      live = false;
    };
  }, []);

  const scenario = useMemo(
    () => customMats.find((m) => m.id === scenarioId) ?? scenarioById(scenarioId),
    [customMats, scenarioId],
  );
  const challenge = challengeId ? (challengeById(challengeId) ?? null) : null;
  const stale = sim !== null && builtFrom !== program;

  /** Throws the simulation away; the next run builds a new one. */
  const invalidate = useCallback(() => {
    audio.stop();
    pair.current?.dispose();
    pair.current = null;
    setSim(null);
    setSim2(null);
    setStatus('ready');
    setStatus2(null);
    setActive(new Set());
  }, [audio]);

  // Tools → Robot setup changes the simulated robot.
  useEffect(() => {
    const changed = () => {
      setRobot(robotGeometry(loadRobot()));
      invalidate();
    };
    window.addEventListener(ROBOT_CHANGED, changed);
    return () => window.removeEventListener(ROBOT_CHANGED, changed);
  }, [invalidate]);

  /** Copies the simulation's state into React state (cheap when nothing changed). */
  const sync = useCallback((s: Simulation, s2: Simulation | null) => {
    setStatus(s.status);
    setStatus2(s2?.status ?? null);
    setResult(judge.current?.current ?? null);
    const blocks = s.activeBlocks().map((a) => a.block);
    setActive((prev) =>
      prev.size === blocks.length && blocks.every((b) => prev.has(b)) ? prev : new Set(blocks),
    );
    setTick((t) => t + 1);
  }, []);

  /** A fresh judge for the challenge, when one is played on this mat. */
  const newJudge = useCallback(() => {
    judge.current =
      challenge && challenge.mat === scenario.id ? new ChallengeJudge(challenge) : null;
    setResult(judge.current?.current ?? null);
  }, [challenge, scenario]);

  /** A simulation of the current program, or null (with problems listed) if it has errors. */
  const build = useCallback((): Simulation | null => {
    pair.current?.dispose();
    pair.current = null;
    let brick = 1;
    try {
      const ir = lowerProgram(program);
      const next = new Simulation(ir, scenario, { robot });
      for (const b of breakpoints) next.breakpoints.add(b);
      next.on((event) => audio.handle(event, speedRef.current));
      let next2: Simulation | null = null;
      if (second) {
        brick = 2;
        const ir2 = lowerProgram(second.kind === 'same' ? program : second.program);
        next2 = new Simulation(ir2, scenario, { robot, start: secondStart(scenario) });
        next2.on((event) => audio.handle(event, speedRef.current));
        pair.current = new BrickPair(next, next2);
      }
      setSim(next);
      setSim2(next2);
      setStatus2(next2?.status ?? null);
      setBuiltFrom(program);
      setProblems([]);
      newJudge();
      return next;
    } catch (error) {
      const messages =
        error instanceof LoweringError
          ? error.issues.map((i) => i.message)
          : [error instanceof Error ? error.message : String(error)];
      setProblems(brick === 2 ? messages.map((m) => `Brick 2: ${m}`) : messages);
      return null;
    }
  }, [program, scenario, robot, second, breakpoints, audio, newJudge]);

  // The animation loop: advances simulated time in step with the clock while running.
  const live = status === 'running' || (status2 === 'running' && status !== 'paused');
  useEffect(() => {
    if (!sim || !live) return;
    const running = () =>
      sim.status === 'running' ||
      (sim2?.status === 'running' && sim.status !== 'paused' && sim.status !== 'ready');
    /** Runs `ms` of simulated time, judging the challenge every 50 ms. */
    const advance = (ms: number) => {
      for (let left = ms; left > 0 && running(); left -= 50) {
        const slice = Math.min(50, left);
        if (pair.current) pair.current.advance(slice);
        else sim.advance(slice);
        const j = judge.current;
        if (!j) continue;
        const verdict = j.update(
          sim.world,
          sim.time,
          sim.status === 'finished' || sim.status === 'error',
        );
        if (verdict.state !== 'running') {
          recordScore(j.challenge.id, verdict);
          sim.stop();
          sim2?.stop();
          break;
        }
      }
    };
    let last = performance.now();
    let lastSync = 0;
    const loop = (now: number) => {
      const elapsed = Math.min(100, now - last);
      last = now;
      advance(elapsed * speedRef.current);
      const going = running();
      if (!going || now - lastSync > 100) {
        lastSync = now;
        sync(sim, sim2);
      }
      if (going) frame.current = requestAnimationFrame(loop);
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
  }, [sim, sim2, live, sync, audio]);

  // Show the robot on its mat as soon as the window opens (and again after the mat,
  // challenge, second brick or robot changes), before the first run. This sets state
  // once per change, not in a loop: build() leaves `sim` set or records problems.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open && !sim) build();
  }, [open, sim, build]);

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

  /** The second brick of the simulation `s` (only when `s` is the current one). */
  const partner = () => pair.current?.slave ?? null;
  const settled = () => judge.current && judge.current.current.state !== 'running';

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
      if (challenge && challenge.mat !== id) setChallengeId(null);
      invalidate();
    },
    scenario,
    scenarios: [...SCENARIOS, ...customMats],
    customMats,
    saveMat: async (mat) => {
      setCustomMats(await storeMat(mat));
      if (mat.id === scenarioId) invalidate();
    },
    deleteMat: async (id) => {
      setCustomMats(await removeMat(id));
      if (id === scenarioId) {
        setScenarioId('empty');
        invalidate();
      }
    },
    sim2,
    status2,
    second,
    setSecond: (next) => {
      setSecondBrick(next);
      invalidate();
    },
    secondName: !second ? null : second.kind === 'same' ? program.name : second.name,
    challenge,
    setChallenge: (id) => {
      setChallengeId(id);
      const next = id ? challengeById(id) : undefined;
      if (next) setScenarioId(next.mat);
      invalidate();
    },
    result,
    audio,
    run: () => {
      audio.unlock();
      const s = current();
      if (!s) return;
      const s2 = partner();
      if (settled() || s.status === 'finished' || s.status === 'error') {
        s.reset();
        s2?.reset();
        newJudge();
      }
      s.start();
      if (s2 && s2.status !== 'running') s2.start();
      sync(s, s2);
    },
    pause: () => {
      if (!sim) return;
      sim.pause();
      sim2?.pause();
      audio.stop();
      sync(sim, sim2);
    },
    step: () => {
      audio.unlock();
      const s = current();
      if (!s) return;
      const s2 = partner();
      if (s2 && s2.status !== 'running') s2.start();
      s.step(0);
      sync(s, s2);
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
      sim2?.reset();
      newJudge();
      sync(sim, sim2);
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
