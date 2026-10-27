import { ArrowLeft, KeyRound, MailCheck, RotateCw, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateEmail } from "@/lib/auth-errors";

const RESEND_COOLDOWN_SECONDS = 60;

export type EmailCodeSignInProps = {
  /** Email already typed on the password form, so it does not need retyping. */
  initialEmail?: string;
  onBack: () => void;
};

/**
 * Passwordless sign-in: Supabase emails a one-time code, the student types it
 * here. No account is created by this flow and no session is claimed until
 * Supabase returns one.
 */
export function EmailCodeSignIn({ initialEmail = "", onBack }: EmailCodeSignInProps) {
  const { sendEmailCode, verifyEmailCode, configProblem } = useAuth();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(
      () => setCooldown((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
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
      const result = await sendEmailCode(email);
      if (result.error) {
        setEmailError(result.error);
        return;
      }
      setStep("code");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCodeError(null);
    setNotice(null);
    setVerifying(true);
    try {
      const result = await verifyEmailCode(email, code);
      if (result.error) {
        setCodeError(result.error);
      }
      // On success the auth listener flips the status and the page navigates.
    } finally {
      setVerifying(false);
    }
  }

  async function handleResend() {
    setCodeError(null);
    setNotice(null);
    setSending(true);
    try {
      const result = await sendEmailCode(email);
      if (result.error) {
        setCodeError(result.error);
        return;
      }
      setNotice("A new code is on its way. Only the newest code works.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } finally {
      setSending(false);
    }
  }

  if (step === "email") {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Sign in with a code</h2>
          <p className="text-sm text-muted">
            Enter the email on your account. Supabase sends a one-time code —
            no password needed.
          </p>
        </div>

        <form
          onSubmit={handleSend}
          noValidate
          aria-label="Email code sign-in form"
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
            Email me a code
          </Button>
        </form>

        <p className="text-xs leading-relaxed text-subtle">
          Codes expire shortly after they are sent. Check your spam folder if
          nothing arrives.
        </p>

        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft className="size-4" />}
          onClick={onBack}
          className="w-full"
        >
          Use my password instead
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
        <h2 className="text-lg font-semibold">Enter your code</h2>
        <p className="text-sm leading-relaxed text-muted">
          If <span className="text-foreground">{email.trim()}</span> has an
          account, a sign-in code is on its way to that inbox. Enter it below.
        </p>
        <p className="text-xs leading-relaxed text-subtle">
          Supabase does not reveal whether an address is registered, so a code
          only arrives for accounts that exist.
        </p>
      </div>

      <form
        onSubmit={handleVerify}
        noValidate
        aria-label="Email code verification form"
        className="flex flex-col gap-3"
      >
        <Input
          label="Sign-in code"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
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
          Verify and sign in
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-line pt-4">
        {notice && <InlineAlert tone="positive">{notice}</InlineAlert>}
        <Button
          type="button"
          variant="secondary"
          icon={<RotateCw className="size-4" />}
          loading={sending}
          disabled={sending || cooldown > 0}
          onClick={() => void handleResend()}
          className="w-full"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          icon={<ArrowLeft className="size-4" />}
          disabled={verifying}
          onClick={() => {
            setStep("email");
            setCode("");
            setCodeError(null);
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
