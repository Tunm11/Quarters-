import { ArrowLeft, KeyRound, MailCheck, RotateCw, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateEmail } from "@/lib/auth-errors";

const RESEND_COOLDOWN_SECONDS = 60;

export type PasswordResetRequestProps = {
  initialEmail?: string;
  onBack: () => void;
};

/**
 * Starts a password reset. Supabase's reset call succeeds whether or not the
 * address has an account, so this panel never claims an account exists — only
 * that a message was requested. The emailed code can be entered here to get a
 * recovery session without leaving the app.
 */
export function PasswordResetRequest({
  initialEmail = "",
  onBack,
}: PasswordResetRequestProps) {
  const { requestPasswordReset, verifyRecoveryCode, configProblem } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setNotice(null);

    const validationError = validateEmail(email);
    if (validationError) {
      setEmailError(validationError);
      return;
    }

    setSending(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.error) {
        setEmailError(result.error);
        return;
      }
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  }

  async function handleResend() {
    setNotice(null);
    setResendError(null);
    setSending(true);
    try {
      const result = await requestPasswordReset(email);
      if (result.error) {
        setResendError(result.error);
        return;
      }
      setNotice("Another reset email was requested. Only the newest code works.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodeError(null);
    setVerifying(true);
    try {
      const result = await verifyRecoveryCode(email, code);
      if (result.error) {
        setCodeError(result.error);
        return;
      }
      navigate("/reset-password", { replace: true });
    } finally {
      setVerifying(false);
    }
  }

  if (!sent) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Forgot your password?</h2>
          <p className="text-sm text-muted">
            Enter your email and Supabase sends a reset link plus a code. Use
            whichever is easier.
          </p>
        </div>

        <form
          onSubmit={handleRequest}
          noValidate
          aria-label="Password reset request form"
          className="flex flex-col gap-4"
        >
          {configProblem && <InlineAlert>{configProblem}</InlineAlert>}

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
            error={emailError ?? undefined}
            disabled={sending}
          />

          <Button
            type="submit"
            loading={sending}
            icon={<Send className="size-4" />}
            className="w-full"
          >
            Send reset email
          </Button>
        </form>

        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft className="size-4" />}
          onClick={onBack}
          className="w-full"
        >
          Back to sign in
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <span
        aria-hidden="true"
        className="grid size-11 place-items-center rounded-tile border border-accent/30 bg-accent/10 text-accent-soft"
      >
        <MailCheck className="size-5" />
      </span>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-sm leading-relaxed text-muted">
          If an account exists for{" "}
          <span className="text-foreground">{email.trim()}</span>, a reset email
          is on its way. Open the link, or enter the code below to set a new
          password without leaving QUARTERS.
        </p>
        <p className="text-xs leading-relaxed text-subtle">
          Supabase does not reveal whether an address is registered. Nothing in
          your inbox? Check spam, wait a minute, then request another.
        </p>
      </div>

      <form
        onSubmit={handleVerify}
        noValidate
        aria-label="Password reset code form"
        className="flex flex-col gap-3"
      >
        <Input
          label="Reset code (optional)"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={10}
          placeholder="Code from the reset email"
          description="Use this instead of the link if you already have the code."
          error={codeError ?? undefined}
          disabled={verifying}
        />

        <Button
          type="submit"
          loading={verifying}
          icon={<KeyRound className="size-4" />}
          className="w-full"
        >
          Continue with code
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {notice && <InlineAlert tone="positive">{notice}</InlineAlert>}
        {resendError && <InlineAlert>{resendError}</InlineAlert>}
        <Button
          type="button"
          variant="secondary"
          icon={<RotateCw className="size-4" />}
          loading={sending}
          disabled={sending || cooldown > 0}
          onClick={() => void handleResend()}
          className="w-full"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend reset email"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft className="size-4" />}
          disabled={verifying}
          onClick={() => {
            setSent(false);
            setCode("");
            setCodeError(null);
            setResendError(null);
            setNotice(null);
            setCooldown(0);
          }}
        >
          Use a different email
        </Button>
      </div>
    </div>
  );
}
