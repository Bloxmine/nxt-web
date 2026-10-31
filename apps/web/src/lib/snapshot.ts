/**
 * Pictures of part of the page (the program canvas): the elements are copied with their
 * computed styles written inline and their images turned into data URLs, then wrapped in
 * an SVG <foreignObject>. The SVG can be saved as it is or drawn onto a canvas for a PNG.
 */

const dataUrls = new Map<string, Promise<string>>();

function toDataUrl(src: string): Promise<string> {
  let url = dataUrls.get(src);
  if (!url) {
    url = fetch(src)
      .then((r) => r.blob())
      .then(
        (blob) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => src);
    dataUrls.set(src, url);
  }
  return url;
}

/** Copies `from`'s computed style onto `to`, and the same for all their descendants. */
async function inlineStyles(from: Element, to: Element, jobs: Promise<void>[]): Promise<void> {
  const style = getComputedStyle(from);
  const target = (to as HTMLElement | SVGElement).style;
  for (let i = 0; i < style.length; i++) {
    const name = style.item(i);
    target.setProperty(name, style.getPropertyValue(name), style.getPropertyPriority(name));
  }
  if (from instanceof HTMLImageElement && to instanceof HTMLImageElement) {
    jobs.push(toDataUrl(from.currentSrc || from.src).then((url) => void (to.src = url)));
  }
  if (from instanceof HTMLCanvasElement && to instanceof HTMLCanvasElement) {
    const img = document.createElement('img');
    img.src = from.toDataURL();
    img.style.cssText = target.cssText;
    to.replaceWith(img);
    return;
  }
  // Form controls show their value through properties, not attributes.
  if (from instanceof HTMLInputElement && to instanceof HTMLInputElement) {
    to.setAttribute('value', from.value);
    if (from.checked) to.setAttribute('checked', '');
  }
  const a = from.children;
  const b = [...to.children];
  for (let i = 0; i < a.length && i < b.length; i++) await inlineStyles(a[i]!, b[i]!, jobs);
  // ::before and ::after (the beam, loop frames, sockets) become real elements.
  for (const pseudo of ['::before', '::after'] as const) {
    const ps = getComputedStyle(from, pseudo);
    const content = ps.content;
    if (!content || content === 'none' || content === 'normal') continue;
    const span = document.createElement('span');
    for (let i = 0; i < ps.length; i++) {
      const name = ps.item(i);
      span.style.setProperty(name, ps.getPropertyValue(name), ps.getPropertyPriority(name));
    }
    span.textContent = (/^"(.*)"$/s.exec(content)?.[1] ?? '').replace(/\\"/g, '"');
    if (pseudo === '::before') to.insertBefore(span, to.firstChild);
    else to.appendChild(span);
  }
}

/** Bounds (relative to `root`, in its own unscaled pixels) that hold all `selector` matches. */
export function contentBounds(root: HTMLElement, selector: string, zoom: number, margin = 32) {
  const origin = root.getBoundingClientRect();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of root.querySelectorAll(selector)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    left = Math.min(left, (r.left - origin.left) / zoom);
    top = Math.min(top, (r.top - origin.top) / zoom);
    right = Math.max(right, (r.right - origin.left) / zoom);
    bottom = Math.max(bottom, (r.bottom - origin.top) / zoom);
  }
  if (!Number.isFinite(left)) return { x: 0, y: 0, width: 200, height: 100 };
  const x = Math.max(0, Math.floor(left - margin));
  const y = Math.max(0, Math.floor(top - margin));
  return { x, y, width: Math.ceil(right + margin - x), height: Math.ceil(bottom + margin - y) };
}

/**
 * An SVG of the area `bounds` of `root` (unscaled pixels), on `background`. The root's
 * own transform (zoom) is dropped so the picture is at 100 %.
 */
export async function snapshotSvg(
  root: HTMLElement,
  bounds: { x: number; y: number; width: number; height: number },
  background: string,
  /** Elements to leave out of the picture (buttons and the like). */
  omit?: string,
): Promise<string> {
  const clone = root.cloneNode(true) as HTMLElement;
  const jobs: Promise<void>[] = [];
  await inlineStyles(root, clone, jobs);
  await Promise.all(jobs);
  if (omit) for (const el of clone.querySelectorAll(omit)) el.remove();
  clone.style.transform = 'none';
  clone.style.position = 'absolute';
  clone.style.left = `${-bounds.x}px`;
  clone.style.top = `${-bounds.y}px`;
  clone.style.margin = '0';
  const frame = document.createElement('div');
  frame.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  frame.style.cssText = `position:relative;overflow:hidden;width:${bounds.width}px;height:${bounds.height}px;background:${background}`;
  frame.appendChild(clone);
  const body = new XMLSerializer().serializeToString(frame);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" ` +
    `viewBox="0 0 ${bounds.width} ${bounds.height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">${body}</foreignObject></svg>`
  );
}

/** Draws an SVG (as made by {@link snapshotSvg}) onto a canvas, `scale` times, as a PNG. */
export async function svgToPng(svg: string, width: number, height: number, scale = 2) {
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))),
      'image/png',
    ),
  );
}
