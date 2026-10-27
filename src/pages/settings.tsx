import {
  AlertTriangle,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  Database,
  Flag,
  House,
  Info,
  LogOut,
  Mail,
  Monitor,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Sparkles,
  Tablet,
  Trash2,
  Undo2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { useAuthSessions } from "@/auth/use-auth-sessions";
import {
  describeDevice,
  formatLastActive,
  type DeviceKind,
} from "@/auth/sessions";
import { PasswordField } from "@/components/auth/password-field";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { ListRowsSkeleton } from "@/components/feedback/skeletons";
import { AccountAvatar } from "@/components/profile/account-avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { validateEmail, validatePassword } from "@/lib/auth-errors";
import { providerStatusMeta } from "@/provider/status";
import { useBlockedRoommates } from "@/roommates/use-blocked-roommates";
import { useProviderApplication } from "@/provider/use-provider-application";
import { pushStateDescription } from "@/notifications/push";
import { usePushNotifications } from "@/notifications/use-push-notifications";
import { countAwaitingReports } from "@/settings/my-reports";
import { useDevicePreferences } from "@/settings/use-device-preferences";
import { useMyReports } from "@/settings/use-my-reports";
import { useSavedRoomAlerts } from "@/settings/use-saved-room-alerts";

function formatDate(value: string | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
}

/** A device row's icon, from the summary of its user agent. */
function deviceIcon(kind: DeviceKind): LucideIcon {
  switch (kind) {
    case "mobile":
      return Smartphone;
    case "tablet":
      return Tablet;
    case "desktop":
      return Monitor;
    default:
      return MonitorSmartphone;
  }
}

type SettingsSectionProps = {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
};

function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: SettingsSectionProps) {
  return (
    <Panel className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-tile border border-line bg-canvas-soft text-accent-soft"
        >
          <Icon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-sm leading-relaxed text-muted">{description}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-2">{children}</div>
    </Panel>
  );
}

type SettingsRowProps = {
  title: string;
  description?: string;
  value?: string;
  control?: ReactNode;
  href?: string;
};

function SettingsRow({ title, description, value, control, href }: SettingsRowProps) {
  const content = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-medium text-foreground">{title}</span>
        {description && (
          <span className="text-xs leading-relaxed text-muted">{description}</span>
        )}
      </span>
      {value && (
        <span className="max-w-[45%] truncate text-sm text-muted">{value}</span>
      )}
      {control}
      {href && (
        <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden="true" />
      )}
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className="flex items-center gap-4 rounded-tile px-1 py-3 transition-colors hover:bg-canvas-soft/60"
      >
        {content}
      </Link>
    );
  }

  return <div className="flex items-center gap-4 px-1 py-3">{content}</div>;
}

export default function SettingsPage() {
  const {
    user,
    profile,
    avatarUrl,
    signOut,
    signOutOthers,
    signOutEverywhere,
    updatePassword,
    changeEmail,
    uploadAvatar,
    removeAvatar,
    deleteAccount,
  } = useAuth();
  const navigate = useNavigate();
  const { preferences, update, reset } = useDevicePreferences();
  const savedRoomAlerts = useSavedRoomAlerts({ userId: user?.id ?? null });
  const push = usePushNotifications();
  const {
    application,
    loadStatus: providerStatus,
    loadError: providerError,
  } = useProviderApplication();

  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [confirmSignOutOthers, setConfirmSignOutOthers] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [confirmSignOutEverywhere, setConfirmSignOutEverywhere] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [preferencesCleared, setPreferencesCleared] = useState(false);
  const {
    blocks,
    status: blocksStatus,
    error: blocksError,
    busyProfileId,
    reload: reloadBlocks,
    unblock,
  } = useBlockedRoommates();
  const [blockActionError, setBlockActionError] = useState<string | null>(null);
  const {
    reports,
    status: reportsStatus,
    error: reportsError,
    reload: reloadReports,
  } = useMyReports();
  const awaitingReports = countAwaitingReports(reports);
  const {
    sessions,
    status: devicesStatus,
    error: devicesError,
    revokingId,
    notice: devicesNotice,
    reload: reloadDevices,
    revoke: revokeDevice,
  } = useAuthSessions({ userId: user?.id ?? null });

  const [emailOpen, setEmailOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);

  const [photoSaving, setPhotoSaving] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [photoNotice, setPhotoNotice] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const email = user?.email ?? "";
  const providerBadge = application ? providerStatusMeta[application.status] : null;

  async function handlePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordUpdated(false);

    const validationError = validatePassword(newPassword, "signUp");
    if (validationError) {
      setPasswordError(validationError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("The new passwords do not match.");
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await updatePassword(newPassword);
      if (result.error) {
        setPasswordError(result.error);
        return;
      }
      setPasswordUpdated(true);
      setPasswordOpen(false);
      setNewPassword("");
      setConfirmPassword("");
    } finally {
      setPasswordSaving(false);
    }
  }

  async function handleEmailChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailError(null);
    setEmailNotice(null);

    const validationError = validateEmail(newEmail);
    if (validationError) {
      setEmailError(validationError);
      return;
    }

    setEmailSaving(true);
    try {
      const result = await changeEmail(newEmail);
      if (result.error) {
        setEmailError(result.error);
        return;
      }
      setEmailOpen(false);
      setNewEmail("");
      setEmailNotice(
        result.changedImmediately
          ? `Your email is now ${user?.email ?? newEmail.trim()}.`
          : `Confirmation sent. Your email changes to ${result.pendingEmail ?? newEmail.trim()} once you confirm the link Supabase emailed you. Your current address stays active until then.`,
      );
    } finally {
      setEmailSaving(false);
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

  async function handleDeleteAccount() {
    if (deleteConfirm.trim() !== "DELETE") {
      setDeleteError("Type DELETE to confirm account deletion.");
      return;
    }
    setDeleteError(null);
    setDeleting(true);
    try {
      const result = await deleteAccount();
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setDeleting(false);
    }
  }

  async function handleSignOut() {
    setSessionError(null);
    setSigningOut(true);
    try {
      const result = await signOut();
      if (result.error) {
        setSessionError(result.error);
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
    }
  }

  async function handleSignOutOthers() {
    setSessionError(null);
    setConfirmSignOutOthers(false);
    setSigningOutOthers(true);
    try {
      const result = await signOutOthers();
      if (result.error) {
        setSessionError(result.error);
        return;
      }
      // Supabase has deleted the other sessions; re-read the list so the screen
      // shows what is left instead of the rows that just ended.
      await reloadDevices();
    } finally {
      setSigningOutOthers(false);
    }
  }

  async function handleRevokeDevice(sessionId: string) {
    setDeviceError(null);
    const message = await revokeDevice(sessionId);
    if (message) setDeviceError(message);
  }

  async function handleUnblock(profileId: string) {
    setBlockActionError(null);
    const message = await unblock(profileId);
    if (message) setBlockActionError(message);
  }

  async function handleSignOutEverywhere() {
    setSessionError(null);
    setSigningOutEverywhere(true);
    try {
      const result = await signOutEverywhere();
      if (result.error) {
        setSessionError(result.error);
        return;
      }
      navigate("/", { replace: true });
    } finally {
      setSigningOutEverywhere(false);
      setConfirmSignOutEverywhere(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <SectionHeading
        id="settings-heading"
        eyebrow="Profile"
        title="Settings"
        level={1}
        description="Account, provider, notifications, accessibility and security — all in one place."
      />

      <div className="mt-8 flex flex-col gap-4">
        <SettingsSection
          title="Account"
          description="The details tied to the account you are signed in with."
          icon={UserRound}
        >
          <div className="flex items-center gap-3 px-1 py-3">
            <AccountAvatar
              src={avatarUrl}
              name={profile?.display_name}
              email={email}
              className="size-14"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">Profile photo</p>
                <p className="text-xs leading-relaxed text-muted">
                  Shown on your account profile and here. Roommate discovery keeps
                  its own photo. JPEG, PNG or WebP · up to 5 MB.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
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
                    Remove
                  </Button>
                )}
              </div>
              {photoError && (
                <p role="alert" className="text-xs leading-relaxed text-danger">
                  {photoError}
                </p>
              )}
              {photoNotice && <InlineAlert tone="positive">{photoNotice}</InlineAlert>}
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Profile photo"
              onChange={(event) => void handlePhoto(event.target.files?.[0])}
            />
          </div>

          <SettingsRow title="Display name" value={profile?.display_name ?? "Not set"} />

          <SettingsRow
            title="Email"
            value={email || "No email on this account"}
            description={
              user?.new_email
                ? `Waiting for confirmation of ${user.new_email}. Your current address stays active until that link is confirmed.`
                : undefined
            }
          />

          <div className="flex flex-col gap-3 px-1 pb-3">
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={<Mail className="size-4" />}
                onClick={() => {
                  setEmailOpen((open) => !open);
                  setEmailError(null);
                }}
              >
                {emailOpen ? "Cancel" : "Change email"}
              </Button>
            </div>

            {emailOpen && (
              <form
                onSubmit={handleEmailChange}
                noValidate
                className="flex flex-col gap-3 rounded-tile border border-line bg-canvas-soft/50 p-3"
                aria-label="Change email"
              >
                <Input
                  label="New email"
                  type="email"
                  value={newEmail}
                  onChange={(event) => {
                    setNewEmail(event.target.value);
                    setEmailNotice(null);
                  }}
                  autoComplete="email"
                  description="Supabase emails a confirmation link. Nothing changes until you confirm it."
                  error={emailError ?? undefined}
                  disabled={emailSaving}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" loading={emailSaving}>
                    Save email
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={emailSaving}
                    onClick={() => {
                      setEmailOpen(false);
                      setEmailError(null);
                      setNewEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {emailNotice && <InlineAlert tone="positive">{emailNotice}</InlineAlert>}
          </div>

          <SettingsRow
            title="Member since"
            value={formatDate(profile?.created_at)}
          />
          <SettingsRow
            title="Edit profile"
            description="Change the name and photo shown on your profile."
            href="/account"
          />
        </SettingsSection>

        <SettingsSection
          title="Provider account"
          description="Publishing permission is separate from your profile."
          icon={Building2}
        >
          <SettingsRow
            title="Application status"
            description={
              providerStatus === "loading"
                ? "Checking your application…"
                : providerStatus === "error"
                  ? (providerError ?? "Your application status could not be loaded.")
                  : providerBadge
                    ? application?.display_name
                    : "No application yet."
            }
            control={
              providerStatus === "loading" ? (
                <Skeleton className="h-6 w-20 rounded-pill" />
              ) : providerBadge ? (
                <Badge tone={providerBadge.tone}>{providerBadge.label}</Badge>
              ) : null
            }
            href="/provider"
          />
          <p className="px-1 pt-1 text-xs leading-relaxed text-subtle">
            {providerBadge?.label === "Approved"
              ? "Only approved providers can publish listings."
              : "A pending, rejected or suspended provider cannot publish listings."}
          </p>
        </SettingsSection>

        <SettingsSection
          title="Notifications"
          description="Choose what you want to hear about. Push is per browser; saved-room alerts follow your account."
          icon={Bell}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Push notifications on this device
              </p>
              <p className="text-xs leading-relaxed text-muted">
                {pushStateDescription(push.state)}
              </p>
            </div>
            {push.state === "subscribed" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void push.disable()}
                loading={push.busy}
              >
                Turn off
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void push.enable()}
                loading={push.busy}
                disabled={!push.canEnable}
              >
                Turn on
              </Button>
            )}
          </div>
          {push.error && (
            <p role="alert" className="px-1 pb-2 text-xs leading-relaxed text-danger">
              {push.error}
            </p>
          )}
          <Switch
            label="New rooms near my campus"
            description="Tell me when an approved provider publishes a new room."
            checked={preferences.notifyNewListings}
            onChange={(checked) => update({ notifyNewListings: checked })}
          />
          <Switch
            label="Updates on saved rooms"
            description="Tell me when a room I saved changes rent or availability. Saving your choice to your account lets the alert reach every device and push."
            checked={savedRoomAlerts.enabled}
            onChange={(checked) => void savedRoomAlerts.update(checked)}
            disabled={savedRoomAlerts.status !== "ready" || savedRoomAlerts.saving}
          />
          {savedRoomAlerts.error && (
            <p
              role="alert"
              className="px-1 pb-2 text-xs leading-relaxed text-danger"
            >
              {savedRoomAlerts.error}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Alerts for saved searches
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Every search you save on Explore has its own new-room alert.
                Turn one on or off, or rename and delete what you watch, on the
                Saved tab.
              </p>
            </div>
            <Link
              to="/saved?tab=searches"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
            >
              Manage searches
            </Link>
          </div>
          <Switch
            label="Weekly email digest"
            description="A short roundup of new rooms and price changes."
            checked={preferences.notifyEmailDigest}
            onChange={(checked) => update({ notifyEmailDigest: checked })}
          />
          <p className="px-1 pt-1 text-xs leading-relaxed text-subtle">
            New-room and digest choices stay on this device, and push is
            delivered by this browser once it is turned on. Email delivery is
            not connected yet.
          </p>
        </SettingsSection>

        <SettingsSection
          title="Appearance & motion"
          description="Control how the interface moves on this device."
          icon={Sparkles}
        >
          <Switch
            label="Reduce motion"
            description="Turns off card and sheet animations and smooth scrolling. Your device setting still applies when this is off."
            checked={preferences.reduceMotion}
            onChange={(checked) => update({ reduceMotion: checked })}
          />
        </SettingsSection>

        <SettingsSection
          title="Security"
          description="Password and session controls for your account."
          icon={ShieldCheck}
        >
          <div className="flex flex-col gap-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-medium text-foreground">Password</p>
                <p className="text-xs leading-relaxed text-muted">
                  Change the password you use to sign in. You stay signed in on
                  this device.
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setPasswordOpen((open) => !open);
                  setPasswordError(null);
                }}
              >
                {passwordOpen ? "Cancel" : "Change password"}
              </Button>
            </div>

            {passwordOpen && (
              <form
                onSubmit={handlePasswordChange}
                noValidate
                className="flex flex-col gap-3 rounded-tile border border-line bg-canvas-soft/50 p-3"
                aria-label="Change password"
              >
                <PasswordField
                  label="New password"
                  value={newPassword}
                  onChange={(value) => {
                    setNewPassword(value);
                    setPasswordUpdated(false);
                  }}
                  autoComplete="new-password"
                  description="At least 8 characters."
                  disabled={passwordSaving}
                />
                <PasswordField
                  label="Confirm new password"
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                  disabled={passwordSaving}
                />
                {passwordError && <InlineAlert>{passwordError}</InlineAlert>}
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm" loading={passwordSaving}>
                    Save password
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={passwordSaving}
                    onClick={() => {
                      setPasswordOpen(false);
                      setPasswordError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {passwordUpdated && (
              <InlineAlert tone="positive">
                Password updated. Use the new password the next time you sign in.
              </InlineAlert>
            )}
          </div>

          <SettingsRow
            title="Sign out of this device"
            description="Ends the session in this browser."
            control={
              <Button
                variant="secondary"
                size="sm"
                loading={signingOut}
                onClick={() => void handleSignOut()}
              >
                Sign out
              </Button>
            }
          />

          {sessionError && <InlineAlert>{sessionError}</InlineAlert>}
        </SettingsSection>

        <SettingsSection
          title="Devices & sessions"
          description="Every device signed in to this account, newest activity first. Ending a session revokes its refresh token immediately."
          icon={MonitorSmartphone}
        >
          {devicesStatus === "loading" && (
            <div className="py-1">
              <span role="status" className="sr-only">
                Loading your signed-in devices
              </span>
              <ListRowsSkeleton rows={2} />
            </div>
          )}

          {devicesStatus === "error" && (
            <ErrorState
              className="my-2"
              title="Devices could not be loaded"
              description={
                devicesError ??
                "Your signed-in devices could not be read from Supabase."
              }
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<RefreshCw className="size-4" />}
                  onClick={() => void reloadDevices()}
                >
                  Try again
                </Button>
              }
            />
          )}

          {devicesStatus === "ready" && sessions.length === 0 && (
            <EmptyState
              icon={MonitorSmartphone}
              title="No active sessions found"
              description="Supabase returned no sessions for this account. Signing in again creates one."
              className="my-2 px-4 py-8"
            />
          )}

          {devicesStatus === "ready" && sessions.length > 0 && (
            <ul className="flex list-none flex-col divide-y divide-line">
              {sessions.map((session) => {
                const device = describeDevice(session.userAgent);
                const Icon = deviceIcon(device.kind);
                return (
                  <li key={session.id} className="flex items-start gap-3 py-3 first:pt-1">
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-tile border border-line bg-canvas-soft text-accent-soft"
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-foreground">
                          {device.label}
                        </p>
                        {session.isCurrent && <Badge tone="accent">This device</Badge>}
                      </div>
                      <p className="text-xs leading-relaxed text-muted">
                        {session.isCurrent
                          ? "Active on this browser"
                          : `Last active: ${formatLastActive(session.lastActiveAt)}`}
                      </p>
                      <p className="text-xs leading-relaxed text-subtle">
                        Signed in {formatDate(session.createdAt)}
                        {session.ip ? ` · IP ${session.ip}` : ""}
                      </p>
                    </div>
                    {!session.isCurrent && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<LogOut className="size-4" />}
                        loading={revokingId === session.id}
                        aria-label={`Sign out of ${device.label}`}
                        onClick={() => void handleRevokeDevice(session.id)}
                      >
                        Sign out
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {devicesNotice && <InlineAlert tone="positive">{devicesNotice}</InlineAlert>}
          {deviceError && <InlineAlert>{deviceError}</InlineAlert>}
          <p className="px-1 pt-1 text-xs leading-relaxed text-subtle">
            Last active comes from Supabase's token refresh record, so it updates
            roughly once an hour. An ended session's current access token expires
            on its own within the hour; its refresh token stops working at once.
          </p>

          <div className="mt-2 flex flex-col gap-3 rounded-tile border border-line bg-canvas-soft/50 p-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Sign out of other devices</p>
              <p className="text-xs leading-relaxed text-muted">
                Ends every session except this one. Use it if a device above is
                not yours.
              </p>
            </div>
            {confirmSignOutOthers ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={signingOutOthers}
                  onClick={() => void handleSignOutOthers()}
                >
                  Yes, sign out other devices
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={signingOutOthers}
                  onClick={() => setConfirmSignOutOthers(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                icon={<LogOut className="size-4" />}
                disabled={devicesStatus !== "ready" || sessions.length < 2}
                onClick={() => setConfirmSignOutOthers(true)}
              >
                Sign out of other devices
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-tile border border-line bg-canvas-soft/50 p-3">
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">Sign out of all devices</p>
              <p className="text-xs leading-relaxed text-muted">
                Ends every session for this account, including this one.
              </p>
            </div>
            {confirmSignOutEverywhere ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  loading={signingOutEverywhere}
                  onClick={() => void handleSignOutEverywhere()}
                >
                  Yes, sign out everywhere
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmSignOutEverywhere(false)}
                  disabled={signingOutEverywhere}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                icon={<LogOut className="size-4" />}
                onClick={() => setConfirmSignOutEverywhere(true)}
              >
                Sign out of all devices
              </Button>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="Blocked roommates"
          description="Blocking hides both profiles, withdraws interest and stops new messages. Unblocking restores discovery but does not restore a past connection."
          icon={ShieldOff}
        >
          {blocksStatus === "loading" && (
            <>
              <span role="status" className="sr-only">
                Loading blocked roommates
              </span>
              <ListRowsSkeleton rows={2} />
            </>
          )}

          {blocksStatus === "error" && (
            <div className="flex flex-col gap-3 px-1 py-2">
              <InlineAlert>{blocksError}</InlineAlert>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                icon={<RefreshCw className="size-4" />}
                onClick={() => void reloadBlocks()}
              >
                Try again
              </Button>
            </div>
          )}

          {blocksStatus === "ready" && blocks.length === 0 && (
            <p className="px-1 py-3 text-sm leading-relaxed text-muted">
              You haven't blocked anyone. You can block or report a roommate from
              their profile or from a conversation's options menu.
            </p>
          )}

          {blocks.length > 0 && (
            <div className="flex flex-col gap-2">
              {blocks.map((block) => (
                <div
                  key={block.id}
                  className="flex items-center gap-3 rounded-tile border border-line bg-panel p-3.5"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-pill border border-line bg-panel-raised text-subtle"
                  >
                    <ShieldOff className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {block.displayName}
                    </p>
                    <p className="text-xs text-subtle">
                      Blocked {formatDate(block.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busyProfileId === block.profileId}
                    onClick={() => void handleUnblock(block.profileId)}
                    icon={<Undo2 className="size-4" />}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}

          {blockActionError && <InlineAlert>{blockActionError}</InlineAlert>}
        </SettingsSection>

        <SettingsSection
          title="Reports you filed"
          description={
            awaitingReports > 0
              ? `${awaitingReports} still with moderators. Reports go only to QUARTERS moderators, who never tell the reported account who filed one.`
              : "Reports go only to QUARTERS moderators, who never tell the reported account who filed one."
          }
          icon={Flag}
        >
          {reportsStatus === "loading" && (
            <>
              <span role="status" className="sr-only">
                Loading the reports you filed
              </span>
              <ListRowsSkeleton rows={2} />
            </>
          )}

          {reportsStatus === "error" && (
            <div className="flex flex-col gap-3 px-1 py-2">
              <InlineAlert>{reportsError}</InlineAlert>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                icon={<RefreshCw className="size-4" />}
                onClick={() => void reloadReports()}
              >
                Try again
              </Button>
            </div>
          )}

          {reportsStatus === "ready" && reports.length === 0 && (
            <EmptyState
              icon={Flag}
              title="No reports yet"
              description="Nothing you file appears here until you file it. Report a room from the room's own page or from your chat with the lister, and a student from their profile or from a conversation's options menu."
              action={
                <Link
                  to="/explore"
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  Browse rooms
                </Link>
              }
              note="A report goes only to QUARTERS moderators, and the account it is about is never told who filed it."
              className="my-2 px-4 py-8"
            />
          )}

          {reports.length > 0 && (
            <div className="flex flex-col gap-2">
              {reports.map((report) => (
                <div
                  key={report.id}
                  className="flex items-start gap-3 rounded-tile border border-line bg-panel p-3.5"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-pill border border-line bg-panel-raised text-subtle"
                  >
                    {report.kind === "listing" ? (
                      <House className="size-4" />
                    ) : (
                      <UserRound className="size-4" />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium text-foreground">
                      {report.subject}
                    </p>
                    <p className="text-xs leading-relaxed text-muted">
                      {report.kind === "listing" ? "Room" : "Student"} ·{" "}
                      {report.reasonLabel}
                    </p>
                    <p className="text-[11px] text-subtle">
                      Sent {formatDate(report.createdAt)}
                    </p>
                  </div>
                  <Badge tone={report.tone}>{report.statusLabel}</Badge>
                </div>
              ))}
            </div>
          )}
        </SettingsSection>

        <SettingsSection
          title="Privacy & data"
          description="What QUARTERS stores, and how to remove it."
          icon={Database}
        >
          <p className="px-1 text-sm leading-relaxed text-muted">
            We store your email, display name, profile photo, saved rooms, messages,
            safety blocks and reports, provider application and any listings you publish. Listings authored by
            approved providers are public; your email and application details are
            not. Browsing history is not collected in this build.
          </p>
          <SettingsRow
            title="Clear device preferences"
            description="Resets notification choices and motion on this device."
            control={
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw className="size-4" />}
                onClick={() => {
                  reset();
                  setPreferencesCleared(true);
                }}
              >
                Clear
              </Button>
            }
          />
          {preferencesCleared && (
            <InlineAlert tone="positive">
              Device preferences reset to their defaults.
            </InlineAlert>
          )}
          <div className="mt-1 flex flex-col gap-3 rounded-tile border border-danger/40 bg-danger/10 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-danger"
                aria-hidden="true"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-sm font-medium text-foreground">Delete account</p>
                <p className="text-xs leading-relaxed text-muted">
                  Permanently removes your profile, profile photo, roommate profile,
                  saved rooms, messages and provider application. This cannot be
                  undone. A room booking must be cancelled first, because its
                  payment record belongs to everyone in the group.
                </p>
              </div>
            </div>

            {deleteOpen ? (
              <>
                <Input
                  label="Type DELETE to confirm"
                  value={deleteConfirm}
                  onChange={(event) => {
                    setDeleteConfirm(event.target.value);
                    setDeleteError(null);
                  }}
                  autoComplete="off"
                  disabled={deleting}
                />
                {deleteError && <InlineAlert>{deleteError}</InlineAlert>}
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-danger/60 text-danger hover:border-danger hover:text-danger"
                    icon={<Trash2 className="size-4" />}
                    loading={deleting}
                    disabled={deleteConfirm.trim() !== "DELETE"}
                    onClick={() => void handleDeleteAccount()}
                  >
                    Delete account permanently
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={deleting}
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteConfirm("");
                      setDeleteError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                className="w-fit border-danger/60 text-danger hover:border-danger hover:text-danger"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  setDeleteOpen(true);
                  setDeleteError(null);
                }}
              >
                Delete my account
              </Button>
            )}
          </div>
        </SettingsSection>

        <SettingsSection
          title="About"
          description="QUARTERS 2.0 — student accommodation, made simple."
          icon={Info}
        >
          <SettingsRow title="Version" value="2.0 (web)" />
          <SettingsRow
            title="How QUARTERS works"
            description="How approval, publishing and moderation fit together."
            href="/how-it-works"
          />
          <SettingsRow
            title="Browse rooms"
            description="Search the published catalogue."
            href="/explore"
          />
          <p className="px-1 pt-1 text-xs leading-relaxed text-subtle">
            Provider approval confirms permission to publish on QUARTERS. It is
            not identity verification or a property inspection.
          </p>
        </SettingsSection>

        <div className="flex flex-wrap items-center justify-between gap-3 pb-2">
          <Link
            to="/account"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            <ChevronRight className="size-4 rotate-180" aria-hidden="true" />
            Back to profile
          </Link>
          <Link
            to="/how-it-works"
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            About QUARTERS
          </Link>
        </div>
      </div>
    </div>
  );
}
