/**
 * PinPoint mark: a circuit trace that bends into a checkmark, with a round
 * solder pad at each end. Also used as the favicon (app/icon.svg).
 */
export function LogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M6 17.5 L13 24.5 L26 8.5"
        stroke="var(--accent)"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="17.5" r="3.1" fill="var(--accent)" />
      <circle cx="26" cy="8.5" r="3.1" fill="var(--accent)" />
      <circle cx="6" cy="17.5" r="1.2" fill="var(--bg)" />
      <circle cx="26" cy="8.5" r="1.2" fill="var(--bg)" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-sans font-bold tracking-tight ${className}`}>
      <span className="text-fg">Pin</span>
      <span className="text-accent-text">Point</span>
    </span>
  );
}

export default function Logo({ size = 28, textClassName = "text-xl" }: { size?: number; textClassName?: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <Wordmark className={textClassName} />
    </span>
  );
}
