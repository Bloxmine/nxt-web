import type { MatShape, Scenario } from './world.js';

/** A stadium (two half circles joined by straight lines) as a closed list of points. */
function stadium(cx: number, cy: number, straight: number, radius: number): [number, number][] {
  const points: [number, number][] = [];
  const half = straight / 2;
  for (let i = 0; i <= 24; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 24;
    points.push([cx + half + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  for (let i = 0; i <= 24; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 24;
    points.push([cx - half + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return points;
}

function barcode(x: number, y: number, bits: string): MatShape[] {
  // Each bit is a 2 cm band; 1 = black.
  return [...bits].flatMap((bit, i) =>
    bit === '1' ? [{ type: 'rect', x: x + i * 2, y, w: 2, h: 14, color: 'black' } as MatShape] : [],
  );
}

/** Mats to try programs on. */
export const SCENARIOS: Scenario[] = [
  {
    id: 'empty',
    name: 'Empty table',
    description: 'A plain table with a fence around it. Good for trying out moves and turns.',
    width: 200,
    height: 150,
    background: '#e8e4da',
    shapes: [],
    walls: [],
    fenced: true,
    start: { x: 100, y: 75, heading: 0 },
  },
  {
    id: 'square',
    name: 'Driving square',
    description: 'A 1 m tape square. Can your robot drive along it and come back to the start?',
    width: 200,
    height: 160,
    background: 'white',
    shapes: [
      {
        type: 'path',
        points: [
          [50, 30],
          [150, 30],
          [150, 130],
          [50, 130],
        ],
        width: 2,
        color: 'black',
        closed: true,
      },
      { type: 'circle', x: 50, y: 30, r: 4, color: 'green' },
    ],
    walls: [],
    fenced: false,
    start: { x: 50, y: 30, heading: 0 },
  },
  {
    id: 'oval',
    name: 'Line-follow oval',
    description:
      'A thick black oval on white, like the test pad. Follow the edge of the line with the light or color sensor.',
    width: 240,
    height: 160,
    background: 'white',
    shapes: [
      { type: 'path', points: stadium(120, 80, 110, 50), width: 2.5, color: 'black', closed: true },
    ],
    walls: [],
    fenced: false,
    start: { x: 110, y: 29, heading: 0 },
  },
  {
    id: 'walls',
    name: 'Obstacle room',
    description:
      'A fenced room with boxes in it. Use the touch or ultrasonic sensor to find your way around.',
    width: 240,
    height: 180,
    background: '#d9d3c4',
    shapes: [{ type: 'rect', x: 200, y: 140, w: 40, h: 40, color: 'green' }],
    walls: [
      { x: 70, y: 0, w: 10, h: 100 },
      { x: 150, y: 70, w: 10, h: 110 },
      { x: 110, y: 30, w: 25, h: 20 },
      { x: 190, y: 30, w: 20, h: 20 },
    ],
    fenced: true,
    start: { x: 30, y: 30, heading: 90 },
  },
  {
    id: 'colors',
    name: 'Color race',
    description:
      'Bands of every color the NXT 2.0 color sensor knows, in a row. Drive across and see what it reads.',
    width: 260,
    height: 100,
    background: 'white',
    shapes: [
      { type: 'rect', x: 40, y: 0, w: 30, h: 100, color: 'blue' },
      { type: 'rect', x: 80, y: 0, w: 30, h: 100, color: 'green' },
      { type: 'rect', x: 120, y: 0, w: 30, h: 100, color: 'yellow' },
      { type: 'rect', x: 160, y: 0, w: 30, h: 100, color: 'red' },
      { type: 'rect', x: 200, y: 0, w: 30, h: 100, color: 'black' },
    ],
    walls: [],
    fenced: false,
    start: { x: 15, y: 50, heading: 0 },
  },
  {
    id: 'sumo',
    name: 'Sumo ring',
    description:
      'A white ring with a black edge and a box in the middle. Stay inside the ring and push the box out.',
    width: 180,
    height: 180,
    background: '#303030',
    shapes: [
      { type: 'circle', x: 90, y: 90, r: 80, color: 'black' },
      { type: 'circle', x: 90, y: 90, r: 74, color: 'white' },
    ],
    walls: [{ x: 120, y: 80, w: 14, h: 20 }],
    fenced: false,
    start: { x: 50, y: 90, heading: 0 },
  },
  {
    id: 'barcode',
    name: 'Barcode cards',
    description:
      'Three striped cards in a row, like a checkout scanner. Count the black bands with the light sensor.',
    width: 260,
    height: 80,
    background: 'white',
    shapes: [
      { type: 'rect', x: 0, y: 30, w: 260, h: 20, color: '#dcdcdc' },
      ...barcode(40, 33, '1010110'),
      ...barcode(110, 33, '1101011'),
      ...barcode(180, 33, '1001101'),
    ],
    walls: [],
    fenced: false,
    start: { x: 15, y: 40, heading: 0 },
  },
];

/** A scenario by id (the empty table when the id is unknown). */
export function scenarioById(id: string): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0]!;
}
