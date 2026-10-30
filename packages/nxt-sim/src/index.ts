/**
 * @nxt/sim — runs programs on a simulated brick and robot.
 *
 * `Simulation` interprets a program's IR against a simulated NXT (motors, sensors,
 * screen, buttons, sound, mailboxes, files) inside a `World` (a mat with walls).
 */
export { glyph } from './font.js';
export { Lcd, LCD_HEIGHT, LCD_WIDTH } from './lcd.js';
export { MAX_SPEED, steeredPowers, type Motor } from './motors.js';
export { SCENARIOS, scenarioById } from './scenarios.js';
export {
  Simulation,
  STEP_MS,
  formatNumber,
  type ButtonName,
  type SimEvent,
  type SimOptions,
  type SimStatus,
  type Value,
} from './simulation.js';
export {
  MAT_COLORS,
  NXT_COLORS,
  ROBOT,
  World,
  classifyColor,
  matColorAt,
  rgbOf,
  solidWalls,
  type MatShape,
  type Pose,
  type Scenario,
  type Wall,
} from './world.js';
