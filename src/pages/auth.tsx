import {
  ArrowLeft,
  KeyRound,
  LogIn,
  MailCheck,
  RotateCw,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { EmailCodeSignIn } from "@/components/auth/email-code-sign-in";
import { PasswordField } from "@/components/auth/password-field";
import { PasswordResetRequest } from "@/components/auth/password-reset-request";
import { SupabaseConfigNotice } from "@/components/auth/supabase-config-notice";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { LoadingState } from "@/components/feedback/loading-state";
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

/**
 * `code` and `forgot` are secondary panels reached from the sign-in form; the
 * segmented control only ever reflects `signIn` / `signUp`.
 */
type Mode = "signIn" | "signUp" | "code" | "forgot";

type PendingConfirmation = {
  email: string;
  /** Supabase sent no email because the address already has an account. */
  alreadyRegistered: boolean;
};

const RESEND_COOLDOWN_SECONDS = 60;

export default function AuthPage() {
  const { status, signIn, signUp, confirmSignUp, resendConfirmation, sessionError } =
    useAuth();
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
  const [pendingConfirmation, setPendingConfirmation] =
    useState<PendingConfirmation | null>(null);
  const [pending, setPending] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (status === "signedIn") {
      navigate(returnTo, { replace: true });
    }
  }, [status, navigate, returnTo]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setTimeout(
      () => setResendCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setFieldErrors({});
    setFormError(null);
    setPendingConfirmation(null);
    setCode("");
    setCodeError(null);
    setResendError(null);
    setResendNotice(null);
    setResendCooldown(0);
    setPassword("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const errors: AuthFieldErrors = {
      email: validateEmail(email),
      password: validatePassword(password, mode === "signUp" ? "signUp" : "signIn"),
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
        setPendingConfirmation({
          email: email.trim(),
          alreadyRegistered: result.alreadyRegistered,
        });
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
      } else if (result.alreadyRegistered) {
        setPendingConfirmation({ email: email.trim(), alreadyRegistered: true });
      }
    } finally {
      setPending(false);
    }
  }

  async function handleVerifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pendingConfirmation) return;
    setCodeError(null);
    setVerifying(true);
    try {
      const result = await confirmSignUp(pendingConfirmation.email, code);
      if (result.error) {
        setCodeError(result.error);
      }
      // On success the auth listener flips the status and the effect navigates.
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    if (!pendingConfirmation) return;
    setResendError(null);
    setResendNotice(null);
    setResending(true);
    try {
      const result = await resendConfirmation(pendingConfirmation.email);
      if (result.error) {
        setResendError(result.error);
        return;
      }
      setResendNotice("Confirmation email sent again. Check your inbox and spam folder.");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setResending(false);
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
  const segmentedMode = isSignUp ? "signUp" : "signIn";
  const visibleError = formError ?? sessionError;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:py-16">
      <div className="order-2 flex flex-col gap-5 lg:order-1">
        <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
          Your QUARTERS account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          One account for rooms and roommates.
        </h1>
        <p className="max-w-md text-sm leading-relaxed text-muted sm:text-base">
          Sign in once and your profile follows you across QUARTERS. One email
          and password is all it takes.
        </p>
        <ul className="flex max-w-md flex-col gap-3 text-sm text-muted">
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            Your session stays on your device and persists across reloads.
          </li>
          <li className="flex items-start gap-2.5">
            <MailCheck className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            If email confirmation is on, enter the code from the confirmation
            email before signing in.
          </li>
          <li className="flex items-start gap-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent-soft" aria-hidden="true" />
            Your profile is private — only you can see it.
          </li>
        </ul>
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-subtle transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back to home
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
              aria-pressed={segmentedMode === option.value}
              disabled={pending}
              onClick={() => switchMode(option.value)}
              className={cn(
                "h-10 rounded-pill text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                segmentedMode === option.value
                  ? "bg-accent text-accent-ink"
                  : "text-muted hover:bg-panel hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode === "code" ? (
          <EmailCodeSignIn
            initialEmail={email}
            onBack={() => switchMode("signIn")}
          />
        ) : mode === "forgot" ? (
          <PasswordResetRequest
            initialEmail={email}
            onBack={() => switchMode("signIn")}
          />
        ) : pendingConfirmation ? (
          <div className="flex flex-col gap-4">
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-tile border border-accent/30 bg-accent/10 text-accent-soft"
            >
              {pendingConfirmation.alreadyRegistered ? (
                <ShieldCheck className="size-5" />
              ) : (
                <MailCheck className="size-5" />
              )}
            </span>

            {pendingConfirmation.alreadyRegistered ? (
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">That email already has an account</h2>
                <p className="text-sm leading-relaxed text-muted">
                  <span className="text-foreground">{pendingConfirmation.email}</span> is
                  already registered, so Supabase did not send a second
                  confirmation email. Sign in with the password you chose for it.
                </p>
                <p className="text-xs leading-relaxed text-subtle">
                  If you never confirmed it, send the confirmation email again
                  below — the link and code in it still work.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold">Confirm your email</h2>
                <p className="text-sm leading-relaxed text-muted">
                  Supabase accepted the sign-up for{" "}
                  <span className="text-foreground">{pendingConfirmation.email}</span>.
                  Enter the code from that email below — no need to open the
                  link, so you stay in the app.
                </p>
                <p className="text-xs leading-relaxed text-subtle">
                  Nothing in your inbox? Check spam, give it a minute, then
                  resend. Codes expire shortly after they are issued.
                </p>
              </div>
            )}

            {!pendingConfirmation.alreadyRegistered && (
              <form
                onSubmit={handleVerifyCode}
                noValidate
                aria-label="Confirm email form"
                className="flex flex-col gap-3"
              >
                <Input
                  label="Confirmation code"
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="Code from the email"
                  error={codeError ?? undefined}
                  disabled={verifying}
                />
                <Button
                  type="submit"
                  loading={verifying}
                  icon={<KeyRound className="size-4" />}
                  className="w-full"
                >
                  Verify code
                </Button>
              </form>
            )}

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {resendError && <InlineAlert>{resendError}</InlineAlert>}
              {resendNotice && <InlineAlert tone="positive">{resendNotice}</InlineAlert>}
              <Button
                type="button"
                variant="secondary"
                icon={<RotateCw className="size-4" />}
                loading={resending}
                disabled={resending || resendCooldown > 0}
                onClick={() => void handleResend()}
                className="w-full"
              >
                {resendCooldown > 0
                  ? `Resend email in ${resendCooldown}s`
                  : "Resend confirmation email"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                icon={<ArrowLeft className="size-4" />}
                onClick={() => switchMode("signIn")}
                className="w-full"
              >
                Back to sign in
              </Button>
            </div>
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

            {visibleError && <InlineAlert>{visibleError}</InlineAlert>}

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

              {!isSignUp && (
                <div className="-mt-1 flex justify-end">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => switchMode("forgot")}
                    className="rounded-sm text-xs font-medium text-subtle transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                loading={pending}
                icon={isSignUp ? <UserPlus className="size-4" /> : <LogIn className="size-4" />}
                className="w-full"
              >
                {isSignUp ? "Create account" : "Sign in"}
              </Button>
            </form>

            {!isSignUp && (
              <div className="flex flex-col gap-3 border-t border-line pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  icon={<MailCheck className="size-4" />}
                  disabled={pending}
                  onClick={() => switchMode("code")}
                  className="w-full"
                >
                  Sign in with a one-time code
                </Button>
                <p className="text-center text-xs leading-relaxed text-subtle">
                  No password needed — Supabase emails a code that works once.
                </p>
              </div>
            )}

          </>
        )}
      </Panel>
    </div>
  );
}
