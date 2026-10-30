const CATEGORIES = [
  { name: 'Motors', color: 'bg-sky-500' },
  { name: 'Sensors', color: 'bg-amber-500' },
  { name: 'Flow', color: 'bg-violet-500' },
  { name: 'Logic & math', color: 'bg-emerald-500' },
  { name: 'Variables', color: 'bg-rose-500' },
  { name: 'Sound', color: 'bg-fuchsia-500' },
  { name: 'Display', color: 'bg-slate-500' },
  { name: 'My blocks', color: 'bg-orange-500' },
];

/** Placeholder block categories; replaced by the Blockly toolbox in Phase 2. */
export function Sidebar() {
  return (
    <nav
      aria-label="Block categories"
      className="w-48 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900"
    >
      <ul className="space-y-1">
        {CATEGORIES.map((c) => (
          <li
            key={c.name}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300"
          >
            <span className={`h-3 w-3 rounded-sm ${c.color}`} aria-hidden />
            {c.name}
          </li>
        ))}
      </ul>
    </nav>
  );
}
