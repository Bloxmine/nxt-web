import { labelOf, roots, walk, type Block, type Program } from '@nxt/blocks';
import { blockSummary } from './summary';

/** One search result. */
export interface SearchHit {
  kind: 'block' | 'variable' | 'comment';
  /** Block to select (for variables: the first block that uses it). */
  blockId?: string;
  /** Tab to open: "main" or a My Block id. */
  tab: string;
  title: string;
  detail: string;
}

/** Every string value in a block's settings (texts, names, file names), children left out. */
function settingsText(block: Block): string {
  const parts: string[] = [];
  const visit = (v: unknown, key = ''): void => {
    if (['body', 'whenTrue', 'whenFalse', 'blocks', 'id'].includes(key)) return;
    if (typeof v === 'string') parts.push(v);
    else if (typeof v === 'number') parts.push(String(v));
    else if (Array.isArray(v)) v.forEach((x) => visit(x));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, k);
  };
  visit(block);
  return parts.join(' ');
}

const tabOfRoot = (root: string) => (root.startsWith('main') ? 'main' : root);

/** Finds blocks, variables and comments matching `query` (case-insensitive). */
export function searchProgram(program: Program, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const blockHits: SearchHit[] = [];
  const hits: SearchHit[] = [];
  const usesOf = new Map<string, { id: string; tab: string }[]>();
  for (const r of roots(program)) {
    const where =
      r.root === 'main'
        ? 'main beam'
        : r.root.startsWith('main#')
          ? `parallel beam ${r.root.slice(5)}`
          : `My Block “${program.myBlocks.find((m) => m.id === r.root)?.name ?? ''}”`;
    walk(r.blocks, (b) => {
      const label = labelOf(b);
      const summary = blockSummary(b);
      const text = `${label} ${b.kind} ${summary} ${settingsText(b)}`.toLowerCase();
      if (text.includes(q)) {
        blockHits.push({
          kind: 'block',
          blockId: b.id,
          tab: tabOfRoot(r.root),
          title: label,
          detail: `${summary} · ${where}`,
        });
      }
      const name = 'name' in b && typeof b.name === 'string' ? b.name : null;
      if (name)
        usesOf.set(name, [...(usesOf.get(name) ?? []), { id: b.id, tab: tabOfRoot(r.root) }]);
    });
  }
  for (const v of program.variables) {
    if (!v.name.toLowerCase().includes(q)) continue;
    const uses = usesOf.get(v.name) ?? [];
    hits.push({
      kind: 'variable',
      ...(uses[0] ? { blockId: uses[0].id } : {}),
      tab: uses[0]?.tab ?? 'main',
      title: v.name,
      detail: `${v.type} variable · used by ${uses.length} block${uses.length === 1 ? '' : 's'}`,
    });
  }
  hits.push(...blockHits);
  for (const c of program.comments ?? []) {
    if (c.text.toLowerCase().includes(q)) {
      hits.push({ kind: 'comment', tab: c.tab, title: 'Comment', detail: c.text.slice(0, 60) });
    }
  }
  return hits;
}
