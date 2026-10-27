import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { navItems } from "@/lib/navigation";

/**
 * Floating paper navigation dock. It hovers above the safe area instead of
 * spanning edge to edge, keeps a compact label under every icon, and gives the
 * active destination a solid olive capsule. AppShell pads content so the dock
 * never covers it.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40"
    >
      <div className="mx-auto w-full max-w-md px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <ul className="flex items-stretch justify-between gap-1 rounded-[1.75rem] border border-line bg-panel/95 p-1.5 shadow-float backdrop-blur-xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.to} className="min-w-0 flex-1">
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                      cn(
                        "flex min-h-12 flex-col items-center justify-center gap-1 rounded-[1.25rem] px-1 py-2 text-[10px] leading-none font-medium transition-colors",
                        isActive
                          ? "bg-accent text-accent-ink shadow-accent"
                          : "text-muted hover:bg-panel-raised hover:text-foreground",
                      )
                    }
                >
                  {() => (
                    <>
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      <span className="w-full truncate text-center">{item.label}</span>
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
