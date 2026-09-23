import GithubIcon from "./icons/GithubIcon";
import Logo from "./Logo";
import ThemeToggle from "./theme/ThemeToggle";

export const GITHUB_URL = "https://github.com/ishaansonar22/PinPoint";

export default function Header() {
  return (
    <header className="flex items-center justify-between py-2">
      <a href="/" className="rounded-md" aria-label="PinPoint home">
        <Logo size={26} textClassName="text-[19px]" />
      </a>
      <nav className="flex items-center gap-2" aria-label="Site">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="PinPoint on GitHub"
          title="GitHub"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2/60 text-muted transition hover:border-border-strong hover:text-fg"
        >
          <GithubIcon size={16} />
        </a>
        <ThemeToggle />
      </nav>
    </header>
  );
}
