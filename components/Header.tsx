export default function Header() {
  return (
    <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 shadow-lg shadow-accent-500/20">
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-ink-950" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 21s-6-5.2-6-11a6 6 0 1 1 12 0c0 5.8-6 11-6 11z" />
            <circle cx="12" cy="10" r="2" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">PinPoint</h1>
          <p className="text-sm text-ink-400">From datasheet to working code, verified.</p>
        </div>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-ink-400 sm:text-right">
        Upload a component datasheet, pick a board, and get wiring plus driver code.
        Every pin choice is checked by a deterministic rules engine — not the AI.
      </p>
    </header>
  );
}
