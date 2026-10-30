import {
  LCD_HEIGHT,
  LCD_WIDTH,
  MAT_COLORS,
  ROBOT,
  type Lcd,
  type Scenario,
  type Simulation,
} from '@nxt/sim';

/** Scale and offset that fit a mat into a canvas, centred. */
export function matTransform(canvas: { width: number; height: number }, scenario: Scenario) {
  const margin = 6;
  const scale = Math.min(
    (canvas.width - 2 * margin) / scenario.width,
    (canvas.height - 2 * margin) / scenario.height,
  );
  return {
    scale,
    ox: (canvas.width - scenario.width * scale) / 2,
    oy: (canvas.height - scenario.height * scale) / 2,
  };
}

const css = (color: string) => MAT_COLORS[color] ?? color;

/** Draws the mat, walls, the robot's trail and the robot itself. */
export function drawMat(ctx: CanvasRenderingContext2D, sim: Simulation): void {
  const { canvas } = ctx;
  const scenario = sim.world.scenario;
  const { scale, ox, oy } = matTransform(canvas, scenario);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#6d6a62';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, ox, oy);

  ctx.fillStyle = css(scenario.background);
  ctx.fillRect(0, 0, scenario.width, scenario.height);
  for (const shape of scenario.shapes) {
    ctx.fillStyle = css(shape.color);
    ctx.strokeStyle = css(shape.color);
    if (shape.type === 'rect') ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
    else if (shape.type === 'circle') {
      ctx.beginPath();
      ctx.arc(shape.x, shape.y, shape.r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      shape.points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      if (shape.closed) ctx.closePath();
      ctx.lineWidth = shape.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
  // 10 cm grid, faint, so distances can be judged.
  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
  ctx.lineWidth = 0.3;
  ctx.beginPath();
  for (let x = 10; x < scenario.width; x += 10) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, scenario.height);
  }
  for (let y = 10; y < scenario.height; y += 10) {
    ctx.moveTo(0, y);
    ctx.lineTo(scenario.width, y);
  }
  ctx.stroke();

  const walls = scenario.fenced
    ? [
        ...scenario.walls,
        { x: -3, y: -3, w: scenario.width + 6, h: 3 },
        { x: -3, y: scenario.height, w: scenario.width + 6, h: 3 },
        { x: -3, y: 0, w: 3, h: scenario.height },
        { x: scenario.width, y: 0, w: 3, h: scenario.height },
      ]
    : scenario.walls;
  for (const w of walls) {
    const g = ctx.createLinearGradient(w.x, w.y, w.x + w.w, w.y + w.h);
    g.addColorStop(0, '#b98b52');
    g.addColorStop(1, '#7a5428');
    ctx.fillStyle = g;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#4b3015';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  const trail = sim.world.trail;
  if (trail.length > 1) {
    ctx.strokeStyle = 'rgba(40, 110, 230, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    trail.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.stroke();
  }

  drawRobot(ctx, sim);
}

function drawRobot(ctx: CanvasRenderingContext2D, sim: Simulation): void {
  const { x, y, heading } = sim.world.pose;
  const kinds = new Set(sim.sensors.filter(Boolean));
  const hasUltrasonic = kinds.has('ultrasonic');
  const hasLight = [...kinds].some((k) => k?.startsWith('light') || k?.startsWith('color'));

  if (hasUltrasonic) {
    const [sx, sy] = sim.world.ahead(ROBOT.sonarOffset);
    const d = sim.world.distance();
    const h = (heading * Math.PI) / 180;
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.5)';
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.min(d, 255) * Math.cos(h), sy + Math.min(d, 255) * Math.sin(h));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((heading * Math.PI) / 180);
  // Wheels.
  ctx.fillStyle = '#222';
  ctx.fillRect(-3, -ROBOT.axle / 2 - 1.6, 6, 2.6);
  ctx.fillRect(-3, ROBOT.axle / 2 - 1, 6, 2.6);
  // Body (the brick), white with an orange centre button.
  const g = ctx.createLinearGradient(0, -6, 0, 6);
  g.addColorStop(0, '#fdfdfd');
  g.addColorStop(1, '#c9c9c9');
  ctx.fillStyle = g;
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.roundRect(-7, -5.5, 13, 11, 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#9fb87a';
  ctx.fillRect(-1, -3, 4, 6);
  ctx.fillStyle = '#e8730c';
  ctx.fillRect(-4.5, -1.2, 2.4, 2.4);
  // Front: bumper and sensors.
  ctx.fillStyle = sim.world.touching() ? '#d42020' : '#777';
  ctx.fillRect(ROBOT.bumperOffset - 2, -4, 1.4, 8);
  if (hasLight) {
    ctx.fillStyle = '#d42020';
    ctx.beginPath();
    ctx.arc(ROBOT.lightOffset, 0, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Draws the brick's screen, `size` canvas pixels per screen pixel. */
export function drawLcd(ctx: CanvasRenderingContext2D, lcd: Lcd, size: number): void {
  const g = ctx.createLinearGradient(0, 0, 0, LCD_HEIGHT * size);
  g.addColorStop(0, '#c7d6a4');
  g.addColorStop(1, '#a9bf84');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LCD_WIDTH * size, LCD_HEIGHT * size);
  ctx.fillStyle = '#26321a';
  for (let row = 0; row < LCD_HEIGHT; row++) {
    for (let col = 0; col < LCD_WIDTH; col++) {
      if (lcd.pixels[row * LCD_WIDTH + col]) {
        ctx.fillRect(
          col * size,
          row * size,
          size - (size > 2 ? 0.5 : 0),
          size - (size > 2 ? 0.5 : 0),
        );
      }
    }
  }
}
