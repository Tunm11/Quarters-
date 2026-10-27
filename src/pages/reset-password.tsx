import { ArrowRight, CheckCircle2, KeyRound, LogIn } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { PasswordResetRequest } from "@/components/auth/password-reset-request";
import { PasswordField } from "@/components/auth/password-field";
import { SupabaseConfigNotice } from "@/components/auth/supabase-config-notice";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { LoadingState } from "@/components/feedback/loading-state";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { MIN_PASSWORD_LENGTH, validatePassword } from "@/lib/auth-errors";

/**
 * Landing route for the password-reset email link. Supabase's recovery link
 * signs the browser in with a short-lived session (`detectSessionInUrl`), so a
 * live session is what proves the link was valid. A missing session means the
 * link expired, was already used, or was opened directly — the page says so
 * and offers a fresh request instead of pretending anything succeeded.
 */
export default function ResetPasswordPage() {
  const {
    status,
    user,
    passwordRecovery,
    updatePassword,
    requestPasswordReset,
    clearPasswordRecovery,
    signOut,
  } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (status === "unconfigured") {
    return <SupabaseConfigNotice />;
  }

  if (status === "loading") {
    return (
      <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
        <LoadingState
          variant="page"
          label="Checking your reset link"
          description="Waiting for Supabase to confirm the recovery session."
        />
      </div>
    );
  }

  if (status === "signedOut") {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 py-12 sm:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
            Password reset
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            This reset link has expired
          </h1>
          <p className="text-sm leading-relaxed text-muted">
            Reset links and codes only work once, and only for a short time.
            Request a fresh one below — nothing on your account has changed.
          </p>
        </div>

        <Panel tone="raised">
          <PasswordResetRequest onBack={() => navigate("/auth")} />
        </Panel>

        <Link
          to="/auth"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-subtle transition-colors hover:text-foreground"
        >
          <LogIn className="size-4" aria-hidden="true" />
          Back to sign in
        </Link>
      </div>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    setPasswordError(null);
    setConfirmError(null);

    const validationError = validatePassword(password, "signUp");
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const result = await updatePassword(password);
      if (result.error) {
        setFormError(result.error);
        return;
      }
      setSaved(true);
      clearPasswordRecovery();
    } finally {
      setSaving(false);
    }
  }

  async function handleStartOver() {
    setLeaving(true);
    try {
      const email = user?.email ?? "";
      if (email) {
        // Request a new link before ending the recovery session so an expired
        // link never leaves the student stuck on a dead end.
        await requestPasswordReset(email);
      }
      await signOut();
      navigate("/auth", { replace: true });
    } finally {
      setLeaving(false);
    }
  }

  if (saved) {
    return (
      <div className="mx-auto w-full max-w-lg px-5 py-12 sm:px-8">
        <Panel tone="raised" className="flex flex-col gap-5">
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-tile border border-positive/30 bg-positive/10 text-positive"
          >
            <CheckCircle2 className="size-5" />
          </span>
          <div className="flex flex-col gap-2">
            <h1 className="text-xl font-semibold">Password updated</h1>
            <p className="text-sm leading-relaxed text-muted">
              Use your new password the next time you sign in. You are still
              signed in on this device.
            </p>
          </div>
          <Button
            type="button"
            icon={<ArrowRight className="size-4" />}
            onClick={() => navigate("/", { replace: true })}
            className="w-full"
          >
            Continue to QUARTERS
          </Button>
        </Panel>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-5 py-12 sm:px-8">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
          Password reset
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Choose a new password
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          {passwordRecovery
            ? "Your reset link is verified."
            : "You are signed in, so you can change your password here."}{" "}
          {user?.email ? (
            <>
              Setting a new password for{" "}
              <span className="text-foreground">{user.email}</span>.
            </>
          ) : (
            "Set a new password for your account."
          )}
        </p>
      </div>

      <Panel tone="raised" className="flex flex-col gap-4">
        {formError && <InlineAlert>{formError}</InlineAlert>}

        <form
          onSubmit={handleSubmit}
          noValidate
          aria-label="Set a new password"
          className="flex flex-col gap-4"
        >
          <PasswordField
            label="New password"
            value={password}
            onChange={(value) => {
              setPassword(value);
              setPasswordError(null);
            }}
            autoComplete="new-password"
            description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={passwordError ?? undefined}
            disabled={saving}
          />

          <PasswordField
            label="Confirm new password"
            value={confirmPassword}
            onChange={(value) => {
              setConfirmPassword(value);
              setConfirmError(null);
            }}
            autoComplete="new-password"
            error={confirmError ?? undefined}
            disabled={saving}
          />

          <Button
            type="submit"
            loading={saving}
            icon={<KeyRound className="size-4" />}
            className="w-full"
          >
            Save new password
          </Button>
        </form>

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-xs leading-relaxed text-subtle">
            Link already used or expired? Request a fresh reset email and this
            session ends.
          </p>
          <Button
            type="button"
            variant="ghost"
            loading={leaving}
            disabled={saving || leaving}
            onClick={() => void handleStartOver()}
          >
            Start over with a new email
          </Button>
        </div>
      </Panel>
    </div>
  );
}
