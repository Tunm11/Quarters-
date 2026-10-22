import {
  ArrowLeft,
  LogIn,
  MailCheck,
  ShieldCheck,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { PasswordField } from "@/components/auth/password-field";
import { SupabaseConfigNotice } from "@/components/auth/supabase-config-notice";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import {
  validateDisplayName,
  validateEmail,
  validatePassword,
  type AuthFieldErrors,
} from "@/lib/auth-errors";
import { cn } from "@/lib/cn";
import { safeReturnTo } from "@/lib/return-to";

type Mode = "signIn" | "signUp";

export default function AuthPage() {
  const { status, signIn, signUp, sessionError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [mode, setMode] = useState<Mode>(
    searchParams.get("mode") === "signup" ? "signUp" : "signIn",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<AuthFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (status === "signedIn") {
      navigate(returnTo, { replace: true });
    }
  }, [status, navigate, returnTo]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setFieldErrors({});
    setFormError(null);
    setConfirmationEmail(null);
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: AuthFieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password, mode),
    };
    if (mode === "signUp") {
      errors.displayName = validateDisplayName(displayName);
    }

    const activeErrors = Object.fromEntries(
      Object.entries(errors).filter(([, message]) => Boolean(message)),
    );
    setFieldErrors(activeErrors);
    if (Object.keys(activeErrors).length > 0) {
      return;
    }

    setPending(true);
    try {
      if (mode === "signIn") {
        const result = await signIn(email, password);
        if (result.error) {
          setFormError(result.error);
        }
        return;
      }

      const result = await signUp(email, password, displayName);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      if (result.requiresEmailConfirmation) {
        setConfirmationEmail(email.trim());
      }
    } finally {
      setPending(false);
    }
  }

  if (status === "unconfigured") {
    return <SupabaseConfigNotice />;
  }

  if (status === "loading" || status === "signedIn") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
        <LoadingState
          variant="page"
          label={status === "signedIn" ? "You are signed in" : "Checking your session"}
          description={
            status === "signedIn"
              ? "Taking you to your account."
              : "Waiting for Supabase to restore any saved session."
          }
        />
      </div>
    );
  }

  const isSignUp = mode === "signUp";
  const visibleError = formError ?? sessionError;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-16">
      <div className="order-2 flex flex-col gap-5 lg:order-1">
        <Badge tone="accent" className="w-fit">
          Stage 1 · Accounts
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          One account for rooms and roommates.
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted sm:text-base">
          Your QUARTERS account is a real Supabase Auth account. There are no mock
          sessions, shared demo logins, or prefilled credentials.
        </p>
        <ul className="flex max-w-md flex-col gap-3 text-sm text-muted">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            Sessions are issued and refreshed by Supabase and persist across
            reloads.
          </li>
          <li className="flex items-start gap-2.5">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            If email confirmation is enabled, you will be asked to confirm before
            a session exists.
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            Profile access is limited to your own row by row-level security.
          </li>
        </ul>
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-subtle transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to QUARTERS
        </Link>
      </div>

      <Panel tone="raised" className="order-1 flex flex-col gap-6 lg:order-2">
        <div
          role="group"
          aria-label="Account mode"
          className="grid grid-cols-2 gap-1 rounded-pill border border-line bg-canvas p-1"
        >
          {(
            [
              { value: "signIn", label: "Sign in" },
              { value: "signUp", label: "Create account" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={mode === option.value}
              disabled={pending}
              onClick={() => switchMode(option.value)}
              className={cn(
                "h-10 rounded-pill text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                mode === option.value
                  ? "bg-accent text-accent-ink"
                  : "text-muted hover:bg-panel hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {confirmationEmail ? (
          <div className="flex flex-col gap-4">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-tile border border-accent/30 bg-accent/10 text-accent-soft"
            >
              <MailCheck className="size-5" />
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">Confirm your email</h2>
              <p className="text-sm leading-relaxed text-muted">
                Supabase accepted the sign-up for{" "}
                <span className="text-foreground">{confirmationEmail}</span>.
                This project requires email confirmation, so no session exists
                yet. Open the confirmation link, then sign in.
              </p>
              <p className="text-xs leading-relaxed text-subtle">
                If no message arrives, check the spam folder and wait a few
                minutes before trying again. The link returns to this app.
              </p>
            </div>
            <Button
              variant="secondary"
              icon={<ArrowLeft className="size-4" />}
              onClick={() => switchMode("signIn")}
            >
              Back to sign in
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <h2 className="text-lg font-semibold">
                {isSignUp ? "Create your account" : "Welcome back"}
              </h2>
              <p className="text-sm text-muted">
                {isSignUp
                  ? "Use an email you can confirm."
                  : "Sign in with the email and password you registered."}
              </p>
            </div>

            {visibleError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-tile border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger"
              >
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{visibleError}</span>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              noValidate
              aria-label="Authentication form"
              className="flex flex-col gap-4"
            >
              {isSignUp && (
                <Input
                  label="Display name (optional)"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="nickname"
                  maxLength={60}
                  error={fieldErrors.displayName}
                  description="2-60 characters. You can change this later."
                  disabled={pending}
                />
              )}

              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                required
                aria-required="true"
                error={fieldErrors.email}
                disabled={pending}
              />

              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                description={isSignUp ? "At least 8 characters." : undefined}
                error={fieldErrors.password}
                disabled={pending}
              />

              <Button
                type="submit"
                loading={pending}
                icon={isSignUp ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
                className="w-full"
              >
                {isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            <p className="text-xs leading-relaxed text-subtle">
              {isSignUp
                ? "QUARTERS never receives your password. Supabase Auth handles sign-up, confirmation, and sessions."
                : "If your email is not confirmed, Supabase will reject the sign-in until you open the confirmation link."}
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
