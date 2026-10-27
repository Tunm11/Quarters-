import {
  Bookmark,
  CalendarDays,
  Briefcase,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Compass,
  House,
  Info,
  LogOut,
  Save,
  Settings as SettingsIcon,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { FormSkeleton } from "@/components/feedback/skeletons";
import { AccountAvatar } from "@/components/profile/account-avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { validateDisplayName } from "@/lib/auth-errors";
import { providerStatusMeta } from "@/provider/status";
import { useProviderApplication } from "@/provider/use-provider-application";

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

const providerKindLabels = {
  landlord: "Landlord",
  agent: "Agent / agency",
} as const;

/** The two provider routes, each preselecting its application type. */
const providerPaths: { kind: "landlord" | "agent"; label: string; hint: string; icon: LucideIcon }[] = [
  {
    kind: "landlord",
    label: "Landlord",
    hint: "Own or manage a property",
    icon: House,
  },
  {
    kind: "agent",
    label: "Agent",
    hint: "Let rooms for owners",
    icon: Briefcase,
  },
];

type QuickLinkProps = {
  to: string;
  icon: LucideIcon;
  title: string;
  hint: string;
};

function QuickLink({ to, icon: Icon, title, hint }: QuickLinkProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-tile border border-line bg-panel-raised p-4 transition-colors hover:border-line-strong hover:bg-panel-hover"
    >
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
      >
        <Icon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="truncate text-xs text-subtle">{hint}</span>
      </span>
      <ChevronRight
        className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export default function AccountPage() {
  const {
    user,
    profile,
    profileStatus,
    profileError,
    avatarUrl,
    saveDisplayName,
    uploadAvatar,
    removeAvatar,
    signOut,
    retryProfile,
  } = useAuth();
  const navigate = useNavigate();
  const {
    application,
    loadStatus: providerLoadStatus,
    loadError: providerLoadError,
  } = useProviderApplication();

  const [displayName, setDisplayName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPhotoNotice(null);
    setPhotoSaving(true);
    try {
      const result = await uploadAvatar(file);
      if (result.error) {
        setPhotoError(result.error);
        return;
      }
      setPhotoNotice("Profile photo updated.");
    } finally {
      setPhotoSaving(false);
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  async function handleRemovePhoto() {
    setPhotoError(null);
    setPhotoNotice(null);
    setPhotoSaving(true);
    try {
      const result = await removeAvatar();
      if (result.error) {
        setPhotoError(result.error);
        return;
      }
      setPhotoNotice("Profile photo removed.");
    } finally {
      setPhotoSaving(false);
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
  const name = profile?.display_name ?? "";
  const providerMeta = application ? providerStatusMeta[application.status] : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <SectionHeading
        id="account-heading"
        eyebrow="Profile"
        title="Your profile"
        level={1}
        description="Your details, provider access and session controls."
      />

      <div className="mt-8 flex flex-col gap-4">
        {/* Identity summary */}
        <Panel tone="raised" className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-sand-wash"
          />
          <div className="relative flex flex-col gap-5">
            <div className="flex items-start gap-4">
              <AccountAvatar
                src={avatarUrl}
                name={name}
                email={user?.email}
                className="size-16 text-xl"
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h2 className="truncate text-xl font-semibold tracking-tight">
                  {name || "Your profile"}
                </h2>
                <p className="break-all text-sm text-muted">{email}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {providerMeta && (
                    <Badge tone={providerMeta.tone}>{providerMeta.label}</Badge>
                  )}
                  <Badge tone="outline">
                    Member since {formatDate(profile?.created_at)}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button
                variant="secondary"
                size="sm"
                icon={<Camera className="size-4" />}
                loading={photoSaving}
                onClick={() => photoInputRef.current?.click()}
              >
                {avatarUrl ? "Change photo" : "Add photo"}
              </Button>
              {avatarUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={photoSaving}
                  onClick={() => void handleRemovePhoto()}
                >
                  Remove photo
                </Button>
              )}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Profile photo"
                onChange={(event) => void handlePhoto(event.target.files?.[0])}
              />
              <Link
                to="/settings"
                className={buttonClasses({ variant: "secondary", size: "sm" })}
              >
                <SettingsIcon className="size-4" aria-hidden="true" />
                Settings
              </Link>
              <Link
                to="/explore"
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                <Compass className="size-4" aria-hidden="true" />
                Browse rooms
              </Link>
            </div>

            {photoError && <InlineAlert>{photoError}</InlineAlert>}
            {photoNotice && <InlineAlert tone="positive">{photoNotice}</InlineAlert>}
          </div>
        </Panel>

        {/* Shortcuts */}
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLink
            to="/explore"
            icon={Compass}
            title="Explore rooms"
            hint="Published rooms near campus"
          />
          <QuickLink
            to="/saved"
            icon={Bookmark}
            title="Saved rooms"
            hint="Your shortlist"
          />
          <QuickLink
            to="/visits"
            icon={CalendarDays}
            title="My visits"
            hint="Requests and confirmations"
          />
          <QuickLink
            to="/how-it-works"
            icon={Info}
            title="How QUARTERS works"
            hint="Approval, publishing and moderation"
          />
        </div>

        {/* Display name */}
        <Panel className="flex flex-col gap-5" id="edit-profile">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
            >
              <UserRound className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base font-semibold">Display name</h2>
              <p className="text-sm leading-relaxed text-muted">
                This is the name shown on your QUARTERS profile. It is not shown
                on public listings unless you are an approved provider.
              </p>
            </div>
          </div>

          {profileStatus === "loading" && (
            <>
              <span role="status" className="sr-only">
                Loading your profile
              </span>
              <FormSkeleton fields={2} />
            </>
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
              {saveError && <InlineAlert>{saveError}</InlineAlert>}

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
                description="Optional, 2–60 characters. Leave blank to clear it."
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
                    Profile saved.
                  </p>
                )}
              </div>
            </form>
          )}
        </Panel>

        {/* Provider access */}
        <Panel className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-11 shrink-0 place-items-center rounded-tile border border-line bg-panel text-accent-soft"
            >
              <Building2 className="size-5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">Provider access</h2>
                {providerMeta && (
                  <Badge tone={providerMeta.tone}>{providerMeta.label}</Badge>
                )}
              </div>
              <p className="text-sm leading-relaxed text-muted">
                {providerLoadStatus === "loading"
                  ? "Checking your provider application…"
                  : providerLoadStatus === "error"
                    ? (providerLoadError ??
                      "Your provider application could not be loaded.")
                    : providerMeta
                      ? providerMeta.summary
                      : "Apply to let rooms as a landlord or agency. Approval is required before you can publish."}
              </p>
              {application && (
                <p className="text-xs text-subtle">
                  {providerKindLabels[application.kind]} ·{" "}
                  {application.display_name} · applied{" "}
                  {formatDate(application.created_at)}
                </p>
              )}
            </div>
          </div>

          {application ? (
            <div>
              <Link
                to="/provider"
                className={buttonClasses({
                  variant: "secondary",
                  size: "sm",
                  className: "w-fit",
                })}
              >
                View application
                <ChevronRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {providerPaths.map((path) => {
                const Icon = path.icon;
                return (
                  <Link
                    key={path.kind}
                    to={`/provider?kind=${path.kind}`}
                    className="group flex items-center gap-3 rounded-tile border border-line bg-panel-raised p-3 transition-colors hover:border-line-strong hover:bg-panel-hover"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-tile border border-accent/25 bg-accent/10 text-accent-soft"
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-foreground">
                        {path.label}
                      </span>
                      <span className="truncate text-xs text-subtle">
                        {path.hint}
                      </span>
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </Link>
                );
              })}
            </div>
          )}
        </Panel>

        {/* Session */}
        <Panel className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Session</h2>
            <p className="text-sm leading-relaxed text-muted">
              You stay signed in on this device until you sign out.
            </p>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium tracking-wide text-subtle uppercase">
                Email
              </dt>
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
            Change your email address, profile photo, password, or delete your
            account in Settings.
          </p>

          {signOutError && <InlineAlert>{signOutError}</InlineAlert>}

          <div className="flex flex-wrap items-center gap-2">
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
