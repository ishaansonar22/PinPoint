import Image from "next/image";

export default function Header() {
  return (
    <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 sm:gap-5">
        <Image
          src="/logo.png"
          alt="PinPoint logo"
          width={160}
          height={160}
          priority
          className="h-28 w-28 shrink-0 select-none sm:h-40 sm:w-40"
        />
        <div>
          <h1 className="sr-only">PinPoint</h1>
          <p className="text-xl font-semibold tracking-tight text-ink-50 sm:text-2xl">
            From datasheet to working code, verified.
          </p>
        </div>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-ink-400 sm:text-right">
        Upload a component datasheet, pick a board, and get wiring plus driver code.
        Every pin choice is checked by a deterministic rules engine — not the AI.
      </p>
    </header>
  );
}
