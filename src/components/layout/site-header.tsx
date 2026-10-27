import { LogIn, UserRound } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { Brand } from "@/components/layout/brand";
import { buttonClasses } from "@/components/ui/button";
import { iconButtonClasses } from "@/components/ui/icon-button";
import { cn } from "@/lib/cn";
import { navItems } from "@/lib/navigation";

/**
 * App header. On phones it stays deliberately light — brand plus two 44px
 * icon controls — so nothing is cramped or clipped at 320px. On wider
 * screens the four primary destinations appear as labelled links.
 */
export function SiteHeader() {
  const { status, profile } = useAuth();
  const isSignedIn = status === "signedIn";

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-2 px-4 sm:h-16 sm:gap-4 sm:px-6 lg:px-8">
        <Brand className="min-w-0" />

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        "inline-flex h-9 items-center gap-2 rounded-pill px-3.5 text-sm transition-colors",
                        isActive
                          ? "bg-panel text-foreground"
                          : "text-muted hover:bg-panel/70 hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {status === "loading" ? (
            <span
              aria-hidden="true"
              className="size-11 animate-pulse rounded-pill border border-line bg-panel/60"
            />
          ) : isSignedIn ? (
            <>
              {/* Phone: icon-only profile access. */}
              <Link
                to="/account"
                aria-label="Open your profile"
                title="Profile"
                className={iconButtonClasses({ className: "sm:hidden" })}
              >
                <UserRound className="size-5" aria-hidden="true" />
              </Link>
              {/* Wider screens: labelled control with the display name. */}
              <Link
                to="/account"
                className={buttonClasses({
                  variant: "secondary",
                  size: "sm",
                  className: "hidden sm:inline-flex",
                })}
              >
                <UserRound className="size-4" aria-hidden="true" />
                <span className="max-w-32 truncate">{profile?.display_name ?? "Profile"}</span>
              </Link>
            </>
          ) : (
            <>
              {/* Phone: icon-only sign-in entry point. */}
              <Link
                to="/auth"
                aria-label="Sign in"
                title="Sign in"
                className={iconButtonClasses({ className: "sm:hidden" })}
              >
                <LogIn className="size-5" aria-hidden="true" />
              </Link>
              <Link
                to="/auth"
                className={buttonClasses({
                  variant: "secondary",
                  size: "sm",
                  className: "hidden sm:inline-flex",
                })}
              >
                <LogIn className="size-4" aria-hidden="true" />
                Sign in
              </Link>
            </>
          )}

        </div>
      </div>
    </header>
  );
}
