export function Header() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <img src="/favicon.svg" alt="" className="h-6 w-6" />
        <h1 className="text-base font-semibold">NXT Web Studio</h1>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled
          title="Available in Phase 4"
          className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Run
        </button>
        <button
          type="button"
          disabled
          title="Available in Phase 1"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-slate-700"
        >
          Connect
        </button>
      </div>
    </header>
  );
}
