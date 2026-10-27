import {
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/** A 1x1 transparent GIF: occupies the frame without a network request. */
const BLANK =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export type PhotoProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src" | "loading" | "decoding"
> & {
  src: string | null | undefined;
  /**
   * Load immediately, for the one photo above the fold. Everything else waits
   * until it is about to scroll into view.
   */
  eager?: boolean;
  /** How far ahead of the viewport a photo arms itself. */
  rootMargin?: string;
};

/**
 * A photo that only fetches when it is nearly on screen.
 *
 * Listing pages show a dozen to two dozen photographs, each a full-resolution
 * file — the browser's own lazy loading still starts far ahead on a fast
 * connection, so a grid of rooms could be downloading tens of megabytes before
 * anything was scrolled. This arms one image at a time as it approaches the
 * viewport, and decodes asynchronously so the main thread stays free to paint.
 *
 * Environments without IntersectionObserver (and non-eager images in tests)
 * simply load straight away, which is the previous behaviour.
 */
export function Photo({
  src,
  eager = false,
  rootMargin = "400px",
  className,
  alt = "",
  ...rest
}: PhotoProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [armed, setArmed] = useState(eager || !src);

  useEffect(() => {
    if (!src) {
      setArmed(false);
      return;
    }

    const node = ref.current;
    if (eager || !node || typeof IntersectionObserver === "undefined") {
      setArmed(true);
      return;
    }

    setArmed(false);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setArmed(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(node);

    return () => observer.disconnect();
  }, [src, eager, rootMargin]);

  return (
    <img
      ref={ref}
      src={armed && src ? src : BLANK}
      alt={alt}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={cn("bg-panel-raised", className)}
      {...rest}
    />
  );
}
