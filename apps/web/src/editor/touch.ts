/**
 * Touch support for the classic editor. Browsers do not fire HTML drag-and-drop events
 * for fingers, so this turns touch gestures into the events the editor already handles:
 *
 * - long press (350 ms) on a draggable block or palette item, then move: synthetic
 *   dragstart / dragover / drop / dragend, with a ghost image under the finger;
 * - touching a data plug and moving: synthetic mousedown / mousemove / mouseup, which
 *   the wiring code listens to.
 *
 * Moving before the long press ends scrolls the canvas as usual.
 */
export function installTouchSupport(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let start: { x: number; y: number; id: number; el: HTMLElement } | null = null;
  let drag: {
    source: HTMLElement;
    ghost: HTMLElement;
    over: Element | null;
    data: DataTransfer;
  } | null = null;
  let wiring: { id: number } | null = null;

  const fire = (target: Element, type: string, x: number, y: number, data: DataTransfer) =>
    target.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer: data,
      }),
    );
  const mouse = (target: EventTarget, type: string, x: number, y: number) =>
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
    );

  const beginDrag = (el: HTMLElement, x: number, y: number) => {
    const data = new DataTransfer();
    fire(el, 'dragstart', x, y, data);
    const ghost = el.cloneNode(true) as HTMLElement;
    ghost.classList.add('touch-ghost');
    ghost.style.width = `${el.getBoundingClientRect().width}px`;
    document.body.appendChild(ghost);
    drag = { source: el, ghost, over: null, data };
    move(x, y);
    navigator.vibrate?.(15);
  };

  const move = (x: number, y: number) => {
    if (!drag) return;
    drag.ghost.style.transform = `translate(${x - 20}px, ${y - 20}px)`;
    const over = document.elementFromPoint(x, y);
    if (over !== drag.over) {
      if (drag.over) fire(drag.over, 'dragleave', x, y, drag.data);
      drag.over = over;
    }
    if (over) fire(over, 'dragover', x, y, drag.data);
  };

  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    const target = e.target as HTMLElement;
    const plug = target.closest<HTMLElement>('[data-plug]');
    if (plug) {
      e.preventDefault();
      wiring = { id: e.pointerId };
      mouse(plug, 'mousedown', e.clientX, e.clientY);
      return;
    }
    const el = target.closest<HTMLElement>('[draggable="true"]');
    if (!el) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, el };
    timer = setTimeout(() => {
      if (start) beginDrag(start.el, start.x, start.y);
    }, 350);
  };

  const pointerMove = (e: PointerEvent) => {
    if (wiring && e.pointerId === wiring.id) {
      mouse(window, 'mousemove', e.clientX, e.clientY);
      return;
    }
    if (drag) {
      e.preventDefault();
      move(e.clientX, e.clientY);
      return;
    }
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) {
      clearTimeout(timer);
      start = null;
    }
  };

  const up = (e: PointerEvent) => {
    clearTimeout(timer);
    start = null;
    if (wiring && e.pointerId === wiring.id) {
      wiring = null;
      mouse(window, 'mouseup', e.clientX, e.clientY);
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over) fire(over, 'drop', e.clientX, e.clientY, d.data);
    fire(d.source, 'dragend', e.clientX, e.clientY, d.data);
    d.ghost.remove();
  };

  // While dragging, stop the page from scrolling under the finger.
  const touchMove = (e: TouchEvent) => {
    if (drag || wiring) e.preventDefault();
  };

  window.addEventListener('pointerdown', down, { passive: false });
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('touchmove', touchMove, { passive: false });
  return () => {
    window.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('touchmove', touchMove);
  };
}
