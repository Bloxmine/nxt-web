import { decodeRic, renderRic } from '@nxt/media';
import { glyph } from './font.js';

/** Screen width in pixels. */
export const LCD_WIDTH = 100;
/** Screen height in pixels. */
export const LCD_HEIGHT = 64;

/**
 * The brick's 100×64 monochrome screen. Coordinates follow the brick: x from the left,
 * y = 0 at the bottom. Text sits on lines 1 (top) to 8 (bottom), 8 pixels each.
 */
export class Lcd {
  /** One byte per pixel, row by row from the top; 1 = dark. */
  readonly pixels = new Uint8Array(LCD_WIDTH * LCD_HEIGHT);
  /** Increases on every change, so views can redraw only when needed. */
  version = 0;

  clear(): void {
    this.pixels.fill(0);
    this.version++;
  }

  /** Sets or clears one pixel (brick coordinates, y up). */
  set(x: number, y: number, on = true): void {
    const px = Math.round(x);
    const row = LCD_HEIGHT - 1 - Math.round(y);
    if (px < 0 || px >= LCD_WIDTH || row < 0 || row >= LCD_HEIGHT) return;
    this.pixels[row * LCD_WIDTH + px] = on ? 1 : 0;
  }

  /** True when the pixel is dark (brick coordinates). */
  get(x: number, y: number): boolean {
    const row = LCD_HEIGHT - 1 - y;
    if (x < 0 || x >= LCD_WIDTH || row < 0 || row >= LCD_HEIGHT) return false;
    return this.pixels[row * LCD_WIDTH + x] === 1;
  }

  /** Text on line 1–8 starting at pixel x; each character fills a 6×8 cell. */
  text(x: number, line: number, text: string): void {
    const top = (Math.round(line) - 1) * 8;
    let cx = Math.round(x);
    for (const char of text) {
      const columns = glyph(char);
      for (let col = 0; col < 6; col++) {
        const bits = columns[col] ?? 0;
        for (let row = 0; row < 8; row++) {
          this.set(cx + col, LCD_HEIGHT - 1 - (top + row), ((bits >> row) & 1) === 1);
        }
      }
      cx += 6;
    }
    this.version++;
  }

  point(x: number, y: number): void {
    this.set(x, y);
    this.version++;
  }

  /** Straight line (Bresenham). */
  line(x0: number, y0: number, x1: number, y1: number): void {
    let x = Math.round(x0);
    let y = Math.round(y0);
    const tx = Math.round(x1);
    const ty = Math.round(y1);
    const dx = Math.abs(tx - x);
    const dy = -Math.abs(ty - y);
    const sx = x < tx ? 1 : -1;
    const sy = y < ty ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 400; guard++) {
      this.set(x, y);
      if (x === tx && y === ty) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
    this.version++;
  }

  /** Circle outline (midpoint algorithm). */
  circle(cx: number, cy: number, radius: number): void {
    const r = Math.round(Math.abs(radius));
    let x = r;
    let y = 0;
    let err = 1 - r;
    while (x >= y) {
      for (const [px, py] of [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ] as const) {
        this.set(cx + px, cy + py);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
    this.version++;
  }

  /** Draws a picture file (.ric) with its bottom-left corner at (x, y). */
  ric(bytes: Uint8Array, x: number, y: number): void {
    renderRic(decodeRic(bytes), { set: (px, py, on) => this.set(px, py, on) }, x, y);
    this.version++;
  }

  /**
   * A picture whose file the simulator doesn't have: a 24×24 placeholder with its
   * bottom-left corner at (x, y).
   */
  picture(x: number, y: number): void {
    const left = Math.round(x);
    const top = Math.round(y) + 23;
    for (let i = 0; i < 24; i++) {
      this.set(left + i, top);
      this.set(left + i, top - 23);
      this.set(left, top - i);
      this.set(left + 23, top - i);
    }
    this.circle(left + 12, top - 12, 8);
    this.set(left + 9, top - 9);
    this.set(left + 15, top - 9);
    this.line(left + 8, top - 15, left + 16, top - 15);
    this.version++;
  }
}
