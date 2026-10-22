import { Link } from "react-router-dom";
import { Brand } from "@/components/layout/brand";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-canvas-soft/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-3">
          <Brand />
          <p className="max-w-xs text-xs leading-relaxed text-subtle">
            Student accommodation and roommate discovery for Nigeria. Built
            mobile-first.
          </p>
        </div>

        <nav aria-label="Footer" className="flex flex-col gap-3 text-sm">
          <Link to="/explore" className="text-muted transition-colors hover:text-foreground">
            Explore
          </Link>
          <Link
            to="/how-it-works"
            className="text-muted transition-colors hover:text-foreground"
          >
            How it works
          </Link>
          <Link to="/account" className="text-muted transition-colors hover:text-foreground">
            Account
          </Link>
        </nav>

        <div className="flex flex-col gap-1.5 text-xs text-subtle">
          <p className="font-medium text-muted">Stage 1 — Accounts</p>
          <p>
            Email accounts and owner-only profiles run on Supabase. No listings
            or payments yet.
          </p>
          <p>© {new Date().getFullYear()} QUARTERS</p>
        </div>
      </div>
    </footer>
  );
}
