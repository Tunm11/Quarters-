import {
  ArrowRight,
  CalendarCheck,
  Compass,
  CreditCard,
  DoorOpen,
  MessageSquare,
  ShieldCheck,
  UserPlus,
  UsersRound,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";

const studentFlow = [
  {
    icon: Wallet,
    title: "Start with what you can pay",
    copy: "Set your budget and campus. QUARTERS should only show rooms within reach, with rent, agency fees, and deposit stated together.",
  },
  {
    icon: ShieldCheck,
    title: "Check the room before you travel",
    copy: "Distance to campus, facilities, power and water situation, and house rules live on the room page — not in a chat thread you have to reconstruct.",
  },
  {
    icon: UsersRound,
    title: "Choose who you live with",
    copy: "Roommate matching is built around routine, budget, and house rules, so shared rooms start from shared expectations.",
  },
  {
    icon: CalendarCheck,
    title: "Request a viewing",
    copy: "Ask to inspect the room, confirm a time, and keep the details of that request attached to the room.",
  },
];

const currentScope = [
  "A mobile-first React application shell with routing",
  "Design tokens for the dark QUARTERS interface",
  "Reusable, accessible UI primitives and state foundations",
  "Email/password accounts through Supabase Auth",
  "A protected account route that waits for the session check",
  "An applied profiles table with owner-only RLS",
];

const laterStages = [
  { icon: DoorOpen, label: "Profile onboarding and listing data" },
  { icon: UsersRound, label: "Roommate matching" },
  { icon: MessageSquare, label: "Viewing requests and messaging" },
  { icon: CreditCard, label: "Payments and rent tracking" },
];

export default function HowItWorksPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-4">
        <Badge tone="accent" className="w-fit">
          Stage 1 · Accounts
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          How QUARTERS will work
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
          QUARTERS is being built for students who need a room near campus and
          for the people letting those rooms. This page explains the intended
          flow and, equally important, what this stage does not include.
        </p>
      </div>

      <section aria-labelledby="student-flow-heading" className="mt-12 flex flex-col gap-6">
        <h2 id="student-flow-heading" className="text-xl font-semibold">
          The student flow
        </h2>
        <ol className="flex flex-col gap-4">
          {studentFlow.map(({ icon: Icon, title, copy }, index) => (
            <li key={title}>
              <Panel className="flex items-start gap-4">
                <span
                  aria-hidden="true"
                  className="grid size-10 shrink-0 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
                >
                  <Icon className="size-5" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-medium text-subtle">
                      Step {index + 1}
                    </span>
                    <h3 className="text-sm font-semibold">{title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-muted">{copy}</p>
                </div>
              </Panel>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="scope-heading" className="mt-12 flex flex-col gap-6">
        <h2 id="scope-heading" className="text-xl font-semibold">
          What this stage includes
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Panel tone="raised" className="flex flex-col gap-4">
            <Badge tone="positive" className="w-fit">
              Ready now
            </Badge>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              {currentScope.map((item) => (
                <li key={item} className="flex gap-2.5">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rounded-full bg-positive" />
                  {item}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="flex flex-col gap-4">
            <Badge tone="neutral" className="w-fit">
              Later stages
            </Badge>
            <ul className="flex flex-col gap-2.5 text-sm text-muted">
              {laterStages.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-2.5">
                  <Icon className="size-4 shrink-0 text-subtle" aria-hidden="true" />
                  {label}
                </li>
              ))}
            </ul>
          </Panel>
        </div>
        <p className="text-xs leading-relaxed text-subtle">
          There is no mock backend, no simulated sign-in, and no hidden data
          layer in this build. Supabase handles authentication and owner-only
          profiles, so one account cannot read another account's profile. If the
          table or a policy is missing, profile requests fail loudly instead of
          falling back to cached or invented data.
        </p>
      </section>

      <div className="mt-12 flex flex-col gap-3 border-t border-line pt-8 sm:flex-row sm:flex-wrap sm:items-center">
        <Link to="/auth?mode=signup" className={buttonClasses({ size: "md" })}>
          <UserPlus className="size-4" aria-hidden="true" />
          Create account
        </Link>
        <Link
          to="/explore"
          className={buttonClasses({ variant: "secondary", size: "md" })}
        >
          <Compass className="size-4" aria-hidden="true" />
          Open Explore
        </Link>
        <Link
          to="/"
          className={buttonClasses({ variant: "ghost", size: "md" })}
        >
          Back to home
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
