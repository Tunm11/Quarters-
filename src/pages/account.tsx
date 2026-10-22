import { Check, LogOut, Save, TriangleAlert, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { validateDisplayName } from "@/lib/auth-errors";

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

export default function AccountPage() {
  const {
    user,
    profile,
    profileStatus,
    profileError,
    saveDisplayName,
    signOut,
    retryProfile,
  } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayName(profile?.display_name ?? "");
  }, [profile?.id, profile?.updated_at, profile?.display_name]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameError(null);
    setSaveError(null);
    setSaved(false);

    const validationError = validateDisplayName(displayName);
    if (validationError) {
      setNameError(validationError);
      return;
    }

    setSaving(true);
    try {
      const result = await saveDisplayName(displayName);
      if (result.error) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSignOutError(null);
    setSigningOut(true);
    try {
      const result = await signOut();
      if (result.error) {
        setSignOutError(result.error);
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  const email = user?.email ?? "No email on this account";

  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col gap-3">
        <Badge tone="accent" className="w-fit">
          Signed in
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your account</h1>
        <p className="text-sm leading-relaxed text-muted">
          Signed in as <span className="text-foreground">{email}</span>.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <Panel className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
            >
              <UserRound className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Profile</h2>
              <p className="text-sm text-muted">
                This is your own row in the profiles table, protected by
                row-level security.
              </p>
            </div>
          </div>

          {profileStatus === "loading" && (
            <LoadingState label="Loading your profile" description="Reading your row from Supabase." />
          )}

          {profileStatus === "error" && (
            <ErrorState
              title="Profile unavailable"
              description={profileError ?? "Your profile could not be loaded."}
              action={
                <Button variant="secondary" size="sm" onClick={retryProfile}>
                  Try again
                </Button>
              }
            />
          )}

          {profileStatus === "ready" && profile && (
            <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
              {saveError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-tile border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger"
                >
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{saveError}</span>
                </div>
              )}

              <Input
                label="Display name"
                value={displayName}
                onChange={(event) => {
                  setDisplayName(event.target.value);
                  setSaved(false);
                }}
                autoComplete="nickname"
                maxLength={60}
                error={nameError ?? undefined}
                description="Optional, 2-60 characters. Leave blank to clear it."
                disabled={saving}
              />

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  loading={saving}
                  icon={<Save className="size-4" />}
                  size="sm"
                >
                  Save profile
                </Button>
                {saved && (
                  <p
                    role="status"
                    className="inline-flex items-center gap-1.5 text-xs text-positive"
                  >
                    <Check className="size-3.5" aria-hidden="true" />
                    Profile saved by Supabase.
                  </p>
                )}
              </div>
            </form>
          )}
        </Panel>

        <Panel className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Session</h2>
            <p className="text-sm text-muted">
              Supabase manages this session and refreshes it while you are active.
            </p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium tracking-wide text-subtle uppercase">Email</dt>
              <dd className="break-all text-foreground">{email}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
                Profile created
              </dt>
              <dd className="text-foreground">{formatDate(profile?.created_at)}</dd>
            </div>
          </dl>

          <p className="text-xs leading-relaxed text-subtle">
            Email changes, avatar uploads, and account deletion are not available
            in this stage.
          </p>

          {signOutError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-tile border border-danger/30 bg-danger/5 px-3.5 py-3 text-sm text-danger"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{signOutError}</span>
            </div>
          )}

          <div>
            <Button
              variant="secondary"
              icon={<LogOut className="size-4" />}
              loading={signingOut}
              onClick={handleSignOut}
            >
              Sign out
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}
