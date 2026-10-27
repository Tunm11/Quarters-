import { cn } from "@/lib/cn";

type IllustrationProps = {
  className?: string;
};

/*
 * The two scenes behind the failure screens.
 *
 * They are inline SVG rather than image files so they cost no extra request,
 * scale cleanly on every phone, and take their colours from the same design
 * tokens as the rest of the interface (change the theme and the drawings
 * follow). Both are decorative: the screen's heading carries the meaning, so
 * assistive technology is told to skip them.
 */

export function NoNetworkIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 168"
      role="presentation"
      aria-hidden="true"
      fill="none"
      className={cn("h-auto w-full", className)}
    >
      {/* Ground shadow, so the scene sits on a surface rather than floating. */}
      <ellipse cx="118" cy="146" rx="72" ry="7" className="fill-line" />

      {/* The paper disc the room sits on, with a dashed outer ring. */}
      <circle
        cx="112"
        cy="92"
        r="55"
        className="fill-panel stroke-line-strong"
        strokeWidth="1.5"
      />
      <circle
        cx="112"
        cy="92"
        r="46"
        strokeDasharray="3 9"
        strokeLinecap="round"
        className="stroke-line-strong"
        strokeWidth="1.5"
      />

      {/* A small room: roof, walls, door. */}
      <path
        d="M84 94 L112 68 L140 94"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent"
        strokeWidth="7"
      />
      <path
        d="M90 94 v20 a7 7 0 0 0 7 7 h30 a7 7 0 0 0 7-7 V94"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-accent"
        strokeWidth="6"
      />
      <rect x="106" y="103" width="12" height="15" rx="3" className="fill-sand-soft" />

      {/* Signal arcs with a slash through them. */}
      <circle cx="186" cy="52" r="3.5" className="fill-caution" />
      <path
        d="M177.5 43.5 A 12 12 0 0 1 194.5 43.5"
        strokeLinecap="round"
        className="stroke-caution"
        strokeWidth="3"
      />
      <path
        d="M170.4 36.4 A 22 22 0 0 1 201.6 36.4"
        strokeLinecap="round"
        className="stroke-caution"
        strokeWidth="3"
      />
      <path
        d="M163.4 29.4 A 32 32 0 0 1 208.6 29.4"
        strokeLinecap="round"
        className="stroke-caution"
        strokeWidth="3"
      />
      <path
        d="M166 33 L206 68"
        strokeLinecap="round"
        className="stroke-danger"
        strokeWidth="3"
      />

      {/* Quiet texture. */}
      <circle cx="59" cy="118" r="2.5" className="fill-sand-soft" />
      <circle cx="166" cy="116" r="2" className="fill-sand-soft" />
    </svg>
  );
}

export function CrashIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 168"
      role="presentation"
      aria-hidden="true"
      fill="none"
      className={cn("h-auto w-full", className)}
    >
      <ellipse cx="120" cy="146" rx="72" ry="7" className="fill-line" />

      {/* The blueprint outline: a screen being repaired. */}
      <rect
        x="48"
        y="32"
        width="144"
        height="98"
        rx="20"
        strokeDasharray="6 8"
        strokeLinecap="round"
        className="stroke-line-strong"
        strokeWidth="2"
      />

      {/* A room card, knocked slightly off square, with a crack through it. */}
      <g transform="rotate(-6 120 88)">
        <rect
          x="72"
          y="48"
          width="96"
          height="80"
          rx="12"
          className="fill-panel stroke-line-strong"
          strokeWidth="1.5"
        />
        <rect x="84" y="58" width="72" height="32" rx="8" className="fill-canvas-soft" />
        <path
          d="M104 90 v-10 a4 4 0 0 1 8 0 v10"
          strokeLinecap="round"
          className="stroke-sand-soft"
          strokeWidth="2.5"
        />
        <rect x="84" y="100" width="44" height="7" rx="3.5" className="fill-line-strong" />
        <rect x="84" y="113" width="26" height="7" rx="3.5" className="fill-line-strong" />
        <path
          d="M152 52 l-11 15 l9 4 l-13 17 l8 3 l-7 13"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-danger"
          strokeWidth="3"
        />
      </g>

      {/* "Under repair" badge. */}
      <circle cx="190" cy="40" r="17" className="fill-caution/12 stroke-caution" strokeWidth="1.5" />
      <path
        d="M190 32 v9"
        strokeLinecap="round"
        className="stroke-caution"
        strokeWidth="3"
      />
      <circle cx="190" cy="47" r="2" className="fill-caution" />
    </svg>
  );
}
