import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useAuth } from "@/auth/use-auth";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  draftFromProfile,
  type MyProfileFieldErrors,
  type MyRoommateProfileDraft,
} from "@/roommates/my-profile";
import { initialsOf } from "@/roommates/roommate-profiles";
import { useMyRoommateProfile } from "@/roommates/use-my-roommate-profile";

export type EditRoommateProfileSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Called after a successful save so the discovery list can refresh. */
  onSaved?: () => void;
};

/**
 * Edits the signed-in student's own discovery profile. The first save creates
 * the row for accounts that do not have one yet.
 *
 * The photo here is the account photo, not a separate roommate photo: one photo
 * is used on the card, the roommate screen, chats, `/account` and Settings, so
 * changing it in any of them changes it everywhere.
 */
export function EditRoommateProfileSheet({
  open,
  onClose,
  onSaved,
}: EditRoommateProfileSheetProps) {
  const { profile, status, error, saving, save } = useMyRoommateProfile();
  const { avatarUrl, uploadAvatar, removeAvatar } = useAuth();
  const [draft, setDraft] = useState<MyRoommateProfileDraft>(() =>
    draftFromProfile(null),
  );
  const [fieldErrors, setFieldErrors] = useState<MyProfileFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bioId = useId();

  // Seed the form once the row arrives (and again if it is replaced).
  useEffect(() => {
    if (status === "ready") setDraft(draftFromProfile(profile));
  }, [profile, status]);

  function update<K extends keyof MyRoommateProfileDraft>(
    key: K,
    value: MyRoommateProfileDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // The photo uploads immediately, so it is saved even if this sheet is closed.
  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    const result = await uploadAvatar(file);
    setPhotoBusy(false);
    if (result.error) setPhotoError(result.error);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function clearPhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    const result = await removeAvatar();
    setPhotoBusy(false);
    if (result.error) setPhotoError(result.error);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const result = await save(draft);
    setFieldErrors(result.fieldErrors);
    if (result.error) {
      setFormError(result.error);
      return;
    }
    if (Object.keys(result.fieldErrors).length > 0) return;
    onSaved?.();
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Your roommate profile">
      {status === "loading" ? (
        <p role="status" className="text-sm text-muted">
          Loading your profile…
        </p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError && <InlineAlert>{formError}</InlineAlert>}
          {error && !formError && <InlineAlert>{error}</InlineAlert>}

          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-pill border border-line bg-sand-wash text-sm font-semibold text-muted"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="size-full object-cover" />
              ) : (
                initialsOf(draft.displayName || "You")
              )}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  loading={photoBusy}
                  disabled={saving}
                >
                  {avatarUrl ? "Change photo" : "Add photo"}
                </Button>
                {avatarUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void clearPhoto()}
                    disabled={saving || photoBusy}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-subtle">
                Your account photo — the same one on Account, Settings, your
                card and chats. JPEG, PNG or WebP · up to 5 MB
              </p>
              {photoError && (
                <p role="alert" className="text-xs text-danger">
                  {photoError}
                </p>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Profile photo"
              onChange={(event) => void handleFileChange(event.target.files?.[0])}
            />
          </div>

          <Input
            label="Display name"
            value={draft.displayName}
            onChange={(event) => update("displayName", event.target.value)}
            error={fieldErrors.displayName}
            maxLength={60}
            required
            disabled={saving}
          />

          <Input
            label="Headline"
            value={draft.headline}
            onChange={(event) => update("headline", event.target.value)}
            placeholder="300 level Law · quiet, tidy"
            error={fieldErrors.headline}
            maxLength={80}
            disabled={saving}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="City"
              value={draft.city}
              onChange={(event) => update("city", event.target.value)}
              error={fieldErrors.city}
              maxLength={80}
              required
              disabled={saving}
            />
            <Input
              label="Area"
              value={draft.neighbourhood}
              onChange={(event) => update("neighbourhood", event.target.value)}
              placeholder="Yaba"
              error={fieldErrors.neighbourhood}
              maxLength={80}
              disabled={saving}
            />
          </div>

          <Input
            label="School"
            value={draft.institution}
            onChange={(event) => update("institution", event.target.value)}
            placeholder="University of Lagos"
            error={fieldErrors.institution}
            maxLength={120}
            disabled={saving}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Yearly budget (₦)"
              value={draft.budget}
              onChange={(event) =>
                update("budget", event.target.value.replace(/[^\d.]/g, ""))
              }
              inputMode="numeric"
              placeholder="650000"
              error={fieldErrors.budget}
              disabled={saving}
            />
            <Input
              label="Move-in date"
              type="date"
              value={draft.moveInDate}
              onChange={(event) => update("moveInDate", event.target.value)}
              disabled={saving}
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor={bioId}
              className="text-xs font-medium tracking-wide text-muted"
            >
              About you
            </label>
            <textarea
              id={bioId}
              value={draft.bio}
              onChange={(event) => update("bio", event.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Sleep schedule, how tidy you are, what you cook…"
              className="min-h-24 w-full resize-y rounded-tile border border-line bg-panel px-3.5 py-3 text-sm text-foreground transition-colors placeholder:text-subtle hover:border-line-strong focus-visible:border-accent/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft"
              disabled={saving}
            />
            {fieldErrors.bio ? (
              <p role="alert" className="text-xs text-danger">
                {fieldErrors.bio}
              </p>
            ) : (
              <p className="text-[11px] text-subtle">{draft.bio.length} / 600</p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-tile border border-line bg-panel-raised p-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={draft.isDiscoverable}
              onChange={(event) => update("isDiscoverable", event.target.checked)}
              className="mt-0.5 size-4 accent-accent"
              disabled={saving}
            />
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">Show me in Find roommate</span>
              <span className="text-xs text-subtle">
                Turning this off hides your card from other students without
                deleting anything.
              </span>
            </span>
          </label>

          <Button type="submit" loading={saving} className="w-full">
            {profile ? "Save changes" : "Publish my profile"}
          </Button>
        </form>
      )}
    </BottomSheet>
  );
}
