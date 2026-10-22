import { Compass } from "lucide-react";
import { Link, NavLink } from "react-router-dom";
import { Brand } from "@/components/layout/brand";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { navItems } from "@/lib/navigation";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Brand />

        <nav aria-label="Primary" className="hidden md:block">
          <ul className="flex items-center gap-1">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex h-9 items-center rounded-pill px-3.5 text-sm transition-colors",
                      isActive
                        ? "bg-panel text-foreground"
                        : "text-muted hover:bg-panel/70 hover:text-foreground",
                    )
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <Badge tone="accent" className="hidden sm:inline-flex">
            Stage 0
          </Badge>
          <Link
            to="/explore"
            className={buttonClasses({ variant: "soft", size: "sm" })}
          >
            <Compass className="size-4" aria-hidden="true" />
            Explore
          </Link>
        </div>
      </div>
    </header>
  );
}
