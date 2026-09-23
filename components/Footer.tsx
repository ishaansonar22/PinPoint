import { GITHUB_URL } from "./Header";
import GithubIcon from "./icons/GithubIcon";
import { LogoMark } from "./Logo";

export default function Footer() {
  return (
    <footer className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-border py-6 text-xs text-muted sm:flex-row">
      <span className="inline-flex items-center gap-2">
        <LogoMark size={16} />
        <span>
          <span className="text-fg-2">Pin</span>
          <span className="text-accent-text">Point</span> · verified by a rules engine and a real compiler
        </span>
      </span>
      <span className="inline-flex items-center gap-4">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition hover:text-fg"
        >
          <GithubIcon size={14} /> GitHub
        </a>
        <span>Built with Claude</span>
      </span>
    </footer>
  );
}
