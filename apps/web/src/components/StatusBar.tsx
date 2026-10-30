export function StatusBar() {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-slate-200 bg-slate-50 px-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden />
        No brick connected
      </span>
    </footer>
  );
}
