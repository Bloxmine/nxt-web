// What is being dragged. Kept in module state because dataTransfer contents
// cannot be read during dragover.
export type DragPayload =
  | { type: 'palette'; key: string }
  | { type: 'myBlock'; ref: string }
  | { type: 'block'; id: string };

let current: DragPayload | null = null;

export function startDrag(event: React.DragEvent, payload: DragPayload): void {
  current = payload;
  event.dataTransfer.effectAllowed = payload.type === 'block' ? 'move' : 'copy';
  event.dataTransfer.setData('text/plain', JSON.stringify(payload));
}

export function currentDrag(): DragPayload | null {
  return current;
}

export function endDrag(): void {
  current = null;
}
