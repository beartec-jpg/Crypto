import { Link } from 'wouter';

export function MarketingFooter() {
  return (
    <footer
      className="border-t border-white/10 bg-[#0e0e0e] px-6 py-8 text-center text-sm text-zinc-500"
      data-testid="marketing-footer"
    >
      <p>© 2026 BEARTEC LTD (17166952).</p>
      <nav className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1" aria-label="Footer">
        <Link href="/privacy">
          <a className="hover:text-white">Privacy</a>
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms">
          <a className="hover:text-white">Terms</a>
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/contact">
          <a className="hover:text-white">Contact</a>
        </Link>
      </nav>
    </footer>
  );
}
