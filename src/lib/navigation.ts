import { Bookmark, Compass, House, UserRound, type LucideIcon } from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (used for the root Home route). */
  end?: boolean;
};

/**
 * The four primary student destinations, shared by the desktop header and the
 * mobile navigation dock so both stay in sync.
 */
export const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/saved", label: "Saved", icon: Bookmark },
  { to: "/account", label: "Profile", icon: UserRound },
];
