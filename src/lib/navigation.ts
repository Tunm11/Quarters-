import { Compass, House, Info, UserRound, type LucideIcon } from "lucide-react";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Match the path exactly (used for the landing route). */
  end?: boolean;
};

/** Shared by the desktop header and the mobile tab bar. */
export const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: House, end: true },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/how-it-works", label: "How it works", icon: Info },
  { to: "/account", label: "Account", icon: UserRound },
];
