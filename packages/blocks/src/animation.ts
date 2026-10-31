import { createBlock } from './catalog.js';
import type { Block, Program } from './model.js';
import { emptyProgram } from './project.js';
import { walkProgram } from './tree.js';

/** How an animation program shows its frames. */
export interface AnimationOptions {
  /** Picture file names (without ".ric"), in order. */
  frames: readonly string[];
  /** Where each frame's bottom-left corner goes (pixels, y = 0 at the bottom). */
  x: number;
  y: number;
  /** How long each frame stays on the screen. */
  secondsPerFrame: number;
  /** Times to play the animation; 0 plays it forever. */
  repeat: number;
}

/**
 * A program that plays pictures one after the other: a loop with a Display (image,
 * clearing the screen) and a Wait for every frame.
 */
export function animationProgram(name: string, options: AnimationOptions): Program {
  const body: Block[] = options.frames.flatMap((frame) => [
    {
      ...createBlock('display'),
      action: 'image',
      image: frame,
      x: options.x,
      y: options.y,
      clear: true,
    } as Block,
    {
      ...createBlock('wait'),
      control: { type: 'time', seconds: options.secondsPerFrame },
    } as Block,
  ]);
  const loop = {
    ...createBlock('loop'),
    control: options.repeat > 0 ? { type: 'count', count: options.repeat } : { type: 'forever' },
    body,
  } as Block;
  return { ...emptyProgram(name), body: [loop] };
}

/**
 * Brick file names for animation frames: the prefix (letters, digits, spaces, _ and -,
 * shortened so the name fits the brick's 15 characters) and a two-digit frame number.
 */
export function frameNames(prefix: string, count: number): string[] {
  const base =
    prefix
      .replace(/[^A-Za-z0-9 _-]/g, '')
      .trim()
      .slice(0, 13) || 'Frame';
  return Array.from({ length: count }, (_, i) => `${base}${String(i + 1).padStart(2, '0')}`);
}

/**
 * Brick files a program shows or plays (pictures as "name.ric", sounds as "name.rso"),
 * from its Display and Sound blocks, including inside My Blocks.
 */
export function filesUsedBy(program: Program): string[] {
  const names = new Set<string>();
  walkProgram(program, (b) => {
    if (b.kind === 'display' && b.action === 'image') {
      names.add(`${(b.image ?? 'Smile 01').replace(/\.ric$/i, '')}.ric`);
    }
    if (b.kind === 'sound' && b.action === 'file' && b.file) {
      names.add(`${b.file.replace(/\.rso$/i, '')}.rso`);
    }
  });
  return [...names];
}
