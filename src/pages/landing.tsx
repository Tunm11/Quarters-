import {
  ArrowRight,
  ArrowUpRight,
  CalendarCheck,
  Check,
  Circle,
  Compass,
  Info,
  LogIn,
  MapPin,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";

const plannedCities = ["Lagos", "Ibadan", "Abuja", "Enugu", "Port Harcourt"];

const capabilities = [
  {
    icon: ShieldCheck,
    title: "Rooms you can trust",
    copy: "Cost, distance to campus, and what is actually included — stated up front instead of discovered on inspection day.",
  },
  {
    icon: UsersRound,
    title: "Roommates that fit",
    copy: "Match on budget, routine, and house rules rather than luck. Fewer awkward first weeks.",
  },
  {
    icon: CalendarCheck,
    title: "Viewings without the runaround",
    copy: "Request a viewing and keep the conversation with the room in one place.",
  },
];

const steps = [
  {
    title: "Set your budget and campus",
    copy: "Tell QUARTERS where you are studying, what you can pay, and how you like to live.",
  },
  {
    title: "Shortlist rooms",
    copy: "Compare verified details side by side: rent, distance, facilities, and house rules.",
  },
  {
    title: "Request a viewing",
    copy: "Ask to see the room, then confirm the details before anything is committed.",
  },
];

const readyNow = [
  "Mobile-first application shell",
  "Dark design token system and Poppins typography",
  "Accessible buttons, inputs, badges, and surfaces",
  "Loading, empty, and error state foundations",
  "Email and password accounts through Supabase Auth",
  "Session-aware protected account route with sign-out",
];

const notBuiltYet = [
  "Profile onboarding, avatars, and email changes",
  "Live listings and roommate matching",
  "Viewing requests, messaging, and payments",
];

function SectionHeading({
  id,
  eyebrow,
  title,
  description,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="text-xs font-medium tracking-[0.18em] text-accent-soft uppercase">
        {eyebrow}
      </p>
      <h2 id={id} className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h2>
      {description && (
        <p className="text-sm leading-relaxed text-muted sm:text-base">{description}</p>
      )}
    </div>
  );
}

function ExplorePreview() {
  return (
    <div className="relative w-full">
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-sheet bg-accent/10 blur-3xl"
      />
      <div className="relative rounded-sheet border border-line-strong bg-panel/85 p-4 shadow-panel backdrop-blur-sm sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-foreground">
            <Search className="size-4 text-subtle" aria-hidden="true" />
            Rooms near campus
          </div>
          <Badge tone="outline">Preview</Badge>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {[0, 1].map((index) => (
            <div
              key={index}
              aria-hidden="true"
              className="rounded-card border border-line bg-canvas-soft/80 p-3"
            >
              <Skeleton className="h-24 w-full rounded-tile" />
              <div className="mt-3 flex flex-col gap-2">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>

        <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-subtle">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Interface preview only. No listings are loaded in this stage.
        </p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-grid mask-fade-b opacity-60"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 left-1/2 h-96 w-[46rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[130px]"
        />

        <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pt-12 pb-16 sm:px-8 sm:pt-16 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16 lg:pt-24 lg:pb-24">
          <div className="flex flex-col gap-6">
            <Badge tone="accent" className="w-fit">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
              Stage 1 · Accounts
            </Badge>

            <h1 className="text-[2.5rem] leading-[1.04] font-semibold tracking-tight text-balance sm:text-6xl">
              Find a room.
              <br />
              <span className="text-accent-soft">Find your people.</span>
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-muted sm:text-lg">
              QUARTERS is the student housing layer for Nigerian campuses: rooms
              near school, clear costs, and roommates who match how you actually
              live.
            </p>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/explore"
                className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
              >
                <Compass className="size-4" aria-hidden="true" />
                Explore rooms
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <Link
                to="/how-it-works"
                className={buttonClasses({
                  variant: "secondary",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                How it works
              </Link>
            </div>

            <p className="flex max-w-lg items-start gap-2 text-xs leading-relaxed text-subtle">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Honest status: accounts and owner-only profiles run on Supabase.
              Listings are still ahead.
            </p>
          </div>

          <ExplorePreview />
        </div>
      </section>

      <section
        aria-labelledby="cities-heading"
        className="border-b border-line bg-canvas-soft/50"
      >
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <h2
              id="cities-heading"
              className="text-xs font-medium tracking-[0.18em] text-subtle uppercase"
            >
              Planned first cities
            </h2>
            <p className="text-xs text-subtle">Coverage is planned. No city is live yet.</p>
          </div>
          <ul className="flex flex-wrap gap-2">
            {plannedCities.map((city) => (
              <li key={city}>
                <Badge tone="outline">
                  <MapPin className="size-3" aria-hidden="true" />
                  {city}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        aria-labelledby="capabilities-heading"
        className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20"
      >
        <SectionHeading
          id="capabilities-heading"
          eyebrow="What we are building"
          title="Housing decisions, made legible"
          description="Every part of QUARTERS is being built around one idea: a student should be able to judge a room and a roommate before spending money or travelling."
        />

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(({ icon: Icon, title, copy }) => (
            <Panel key={title} className="flex flex-col gap-4">
              <span
                aria-hidden="true"
                className="grid size-11 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
              >
                <Icon className="size-5" />
              </span>
              <h3 className="text-base font-semibold">{title}</h3>
              <p className="text-sm leading-relaxed text-muted">{copy}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="flow-heading"
        className="border-y border-line bg-canvas-soft/40"
      >
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="flex flex-col gap-5">
            <SectionHeading
              id="flow-heading"
              eyebrow="The flow"
              title="Three steps, no guesswork"
              description="Short, obvious actions. Each one keeps a visible label next to its icon so nothing depends on symbols alone."
            />
            <Link
              to="/how-it-works"
              className="inline-flex w-fit items-center gap-1.5 rounded-pill text-sm font-medium text-accent-soft transition-colors hover:text-foreground"
            >
              Read the full walkthrough
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </div>

          <ol className="flex flex-col gap-3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <Panel className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-tile border border-line-strong bg-canvas text-sm font-semibold text-accent-soft"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold">{step.title}</h3>
                    <p className="text-sm leading-relaxed text-muted">{step.copy}</p>
                  </div>
                </Panel>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="status-heading"
        className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-20"
      >
        <SectionHeading
          id="status-heading"
          eyebrow="Build status"
          title="What is real today, and what is not"
          description="This build is the foundation only. The lists below are deliberately explicit so nobody mistakes the shell for a working marketplace."
        />

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Panel tone="raised" className="flex flex-col gap-4">
            <Badge tone="positive" className="w-fit">
              In this build
            </Badge>
            <ul className="flex flex-col gap-3">
              {readyNow.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-positive"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="flex flex-col gap-4">
            <Badge tone="neutral" className="w-fit">
              Not built yet
            </Badge>
            <ul className="flex flex-col gap-3">
              {notBuiltYet.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-muted">
                  <Circle className="mt-1 size-2.5 shrink-0 text-subtle" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-auto text-xs leading-relaxed text-subtle">
              Supabase handles authentication and owner-only profiles. No
              listings, messaging, or payments are wired up yet.
            </p>
          </Panel>
        </div>
      </section>

      <section aria-labelledby="cta-heading" className="mx-auto w-full max-w-6xl px-5 pb-20 sm:px-8">
        <div className="relative overflow-hidden rounded-sheet border border-accent/25 bg-gradient-to-b from-accent/15 via-panel to-panel p-6 text-center sm:p-12">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-accent/25 blur-[100px]"
          />
          <div className="relative flex flex-col items-center gap-5">
            <h2
              id="cta-heading"
              className="max-w-xl text-2xl font-semibold tracking-tight text-balance sm:text-3xl"
            >
              Create your account. Rooms are next.
            </h2>
            <p className="max-w-lg text-sm leading-relaxed text-muted">
              Sign up with email and password. Supabase issues and confirms the
              account and keeps your profile private to you; listings arrive in
              a later stage.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/auth?mode=signup"
                className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })}
              >
                <UserPlus className="size-4" aria-hidden="true" />
                Create account
              </Link>
              <Link
                to="/auth"
                className={buttonClasses({
                  variant: "secondary",
                  size: "lg",
                  className: "w-full sm:w-auto",
                })}
              >
                <LogIn className="size-4" aria-hidden="true" />
                Sign in
              </Link>
            </div>
            <p className="text-xs text-subtle">
              Real Supabase Auth. No mock accounts, sample sessions, or fallback
              data.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
