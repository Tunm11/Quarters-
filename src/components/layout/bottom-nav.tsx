import { NavLink } from "react-router-dom";
import { cn } from "@/lib/cn";
import { navItems } from "@/lib/navigation";

/**
 * Mobile-first primary navigation. Each tab keeps a visible text label next to
 * its icon, and NavLink supplies aria-current="page" for the active route.
 */
export function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-tile text-[11px] font-medium transition-colors",
                    isActive
                      ? "bg-panel/80 text-accent-soft"
                      : "text-subtle hover:bg-panel/50 hover:text-muted",
                  )
                }
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="text-center leading-tight">{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
