import { cn } from "@/lib/cn";

function initialsOf(
  displayName: string | null | undefined,
  email: string | undefined,
): string {
  const name = displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    return parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }
  return email?.[0]?.toUpperCase() ?? "Q";
}

export type AccountAvatarProps = {
  /** Signed URL for an uploaded photo; null falls back to initials. */
  src?: string | null;
  name?: string | null;
  email?: string | undefined;
  className?: string;
};

/**
 * The account's round photo, or its initials while there is no photo.
 *
 * Decorative: the name it belongs to is always rendered next to it, so the
 * avatar carries no accessible text of its own.
 */
export function AccountAvatar({ src, name, email, className }: AccountAvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-14 shrink-0 place-items-center overflow-hidden rounded-pill border border-line bg-accent/15 text-sm font-semibold text-accent-soft",
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="size-full object-cover"
        />
      ) : (
        initialsOf(name, email)
      )}
    </span>
  );
}
