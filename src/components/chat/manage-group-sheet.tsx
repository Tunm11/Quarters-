import {
  Check,
  Flag,
  ImagePlus,
  LogOut,
  MoreVertical,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import {
  RoommateSafetySheet,
  type RoommateSafetyMode,
} from "@/components/roommates/roommate-safety-sheet";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  addChatGroupMember,
  loadChatContacts,
  loadChatGroupMembers,
  leaveChatGroup,
  removeChatGroupMember,
  renameChatGroup,
  setChatGroupAvatar,
  type ChatContact,
  type ChatGroupMember,
} from "@/chat/groups";
import { signChatImageUrls, uploadChatImage, validateChatImage } from "@/chat/media";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { initialsOf, roommateCardGradient } from "@/roommates/roommate-profiles";
import { loadMyBlocks } from "@/roommates/safety";

/** The member a safety sheet is open for, and which action it performs. */
type SafetyTarget = {
  mode: RoommateSafetyMode;
  profileId: string;
  displayName: string;
};

export type ManageGroupSheetProps = {
  open: boolean;
  onClose: () => void;
  group: {
    groupId: string;
    name: string;
    createdBy: string;
    avatarPath: string | null;
  };
  /** Signed URL for the current picture, when the inbox already has one. */
  avatarUrl: string | null;
  viewerId: string;
  /** Something about the group changed: name, picture or membership. */
  onChanged: () => void;
  /** The viewer left; close everything and refresh the inbox. */
  onLeft: () => void;
};

/**
 * One place to run a group: picture, name, members and leaving. The creator
 * sees the editing controls; everyone else sees who is in the group and the
 * leave button. Every write goes through the creator-checked RPCs.
 */
export function ManageGroupSheet({
  open,
  onClose,
  group,
  avatarUrl,
  viewerId,
  onChanged,
  onLeft,
}: ManageGroupSheetProps) {
  const [members, setMembers] = useState<ChatGroupMember[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [name, setName] = useState(group.name);
  const [avatarPath, setAvatarPath] = useState(group.avatarPath);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  /** Which member's options menu is open. */
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [safetyTarget, setSafetyTarget] = useState<SafetyTarget | null>(null);
  /** Profiles the viewer has blocked, so a blocked member is never re-offered. */
  const [blockedProfileIds, setBlockedProfileIds] = useState<string[]>([]);
  const [safetyNote, setSafetyNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // A fresh group or a reopen starts from the server's copy.
  useEffect(() => {
    if (!open) return;
    setName(group.name);
    setAvatarPath(group.avatarPath);
    setPreview(avatarUrl);
    setConfirmLeave(false);
    setAddOpen(false);
    setMenuFor(null);
    setSafetyTarget(null);
    setSafetyNote(null);
    setError(null);
  }, [open, group.groupId, group.name, group.avatarPath, avatarUrl]);

  useEffect(() => {
    const client = supabase;
    if (!open || !client) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    // The member's block state is loaded with the roster: a blocked member is
    // shown as blocked instead of being offered a block the database refuses.
    void Promise.all([
      loadChatGroupMembers(client, group.groupId),
      loadChatContacts(client),
      loadMyBlocks(client, viewerId),
    ]).then(([memberResult, contactResult, blockResult]) => {
      if (!active) return;
      setMembers(memberResult.members);
      setContacts(contactResult.contacts);
      setBlockedProfileIds(blockResult.blocks.map((block) => block.profileId));
      setError(memberResult.error ?? contactResult.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open, group.groupId, viewerId]);

  const creatorId =
    members.find((member) => member.is_creator)?.user_id ?? group.createdBy;
  const isCreator = creatorId === viewerId;
  // Only trustworthy once the member list has loaded.
  const onlyMember = !loading && members.length <= 1;
  const memberIds = new Set(members.map((member) => member.user_id));
  const addable = contacts.filter((contact) => !memberIds.has(contact.user_id));
  const nameChanged = name.trim() !== group.name && name.trim().length > 0;

  async function handleAvatarFile(file: File | null) {
    const client = supabase;
    if (!file || !client) return;

    const invalid = validateChatImage(file);
    if (invalid) {
      setError(invalid);
      return;
    }

    setBusy("avatar");
    setError(null);
    const uploaded = await uploadChatImage(client, {
      kind: "group-avatar",
      conversationId: group.groupId,
      file,
    });

    if (!uploaded.path || uploaded.error) {
      setBusy(null);
      setError(uploaded.error ?? "Could not upload that photo.");
      return;
    }

    const saved = await setChatGroupAvatar(client, {
      groupId: group.groupId,
      path: uploaded.path,
    });
    setBusy(null);

    if (saved.error) {
      setError(saved.error);
      return;
    }

    setAvatarPath(uploaded.path);
    const urls = await signChatImageUrls(client, [uploaded.path]);
    setPreview(urls.get(uploaded.path) ?? null);
    onChanged();
  }

  async function handleRemoveAvatar() {
    const client = supabase;
    if (!client) return;

    setBusy("avatar");
    setError(null);
    const result = await setChatGroupAvatar(client, {
      groupId: group.groupId,
      path: null,
    });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    setAvatarPath(null);
    setPreview(null);
    onChanged();
  }

  async function handleRename() {
    const client = supabase;
    if (!client) return;

    setBusy("rename");
    setError(null);
    const result = await renameChatGroup(client, {
      groupId: group.groupId,
      name,
    });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    onChanged();
  }

  async function handleAdd(contact: ChatContact) {
    const client = supabase;
    if (!client) return;

    setBusy(`add-${contact.user_id}`);
    setError(null);
    const result = await addChatGroupMember(client, {
      groupId: group.groupId,
      userId: contact.user_id,
    });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    // Re-read the roster rather than guessing the new row: the server also
    // returns the member's roommate profile, which the safety menu needs.
    const refreshed = await loadChatGroupMembers(client, group.groupId);
    if (!refreshed.error) setMembers(refreshed.members);
    onChanged();
  }

  async function handleRemove(member: ChatGroupMember) {
    const client = supabase;
    if (!client) return;

    setBusy(`remove-${member.user_id}`);
    setError(null);
    const result = await removeChatGroupMember(client, {
      groupId: group.groupId,
      userId: member.user_id,
    });
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }

    setMembers((current) =>
      current.filter((row) => row.user_id !== member.user_id),
    );
    onChanged();
  }

  /** A member was blocked from their options menu: they can no longer reach you. */
  function handleBlocked(target: SafetyTarget) {
    setSafetyTarget(null);
    setBlockedProfileIds((current) =>
      current.includes(target.profileId) ? current : [...current, target.profileId],
    );
    setSafetyNote(
      `${target.displayName} is blocked. They cannot message you or send you interest, and you can undo this in Settings.`,
    );
    onChanged();
  }

  async function handleLeave() {
    const client = supabase;
    if (!client) return;

    setBusy("leave");
    setError(null);
    const result = await leaveChatGroup(client, group.groupId);
    setBusy(null);

    if (result.error) {
      setError(result.error);
      return;
    }
    onLeft();
  }

  return (
    <BottomSheet
      open={open}
      /* The safety sheet can sit on top, so Escape closes only that one. */
      onClose={() => {
        if (!safetyTarget) onClose();
      }}
      title="Group settings"
      size="tall"
    >
      <div className="flex flex-col gap-6 pb-2">
        {error && <InlineAlert>{error}</InlineAlert>}

        {safetyNote && <InlineAlert tone="positive">{safetyNote}</InlineAlert>}

        {/* Picture */}
        <section aria-labelledby="group-photo-heading" className="flex items-center gap-4">
          <span className="relative grid size-16 shrink-0 place-items-center overflow-hidden rounded-pill border border-line bg-sand-wash text-subtle">
            {preview ? (
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-5" aria-hidden="true" />
            )}
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <h3 id="group-photo-heading" className="text-sm font-medium text-foreground">
              Group photo
            </h3>
            <p className="text-[11px] leading-relaxed text-subtle">
              {isCreator
                ? "Members see this next to the group name."
                : "Only the group creator can change the photo."}
            </p>
            {isCreator && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  loading={busy === "avatar"}
                  icon={<ImagePlus className="size-4" />}
                >
                  {avatarPath ? "Change" : "Add photo"}
                </Button>
                {avatarPath && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleRemoveAvatar()}
                    disabled={busy !== null}
                    icon={<Trash2 className="size-4" />}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose a group photo"
            className="sr-only"
            onChange={(event) => {
              void handleAvatarFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </section>

        {/* Name */}
        <section aria-labelledby="group-name-heading" className="flex flex-col gap-2">
          <h3 id="group-name-heading" className="text-sm font-medium text-foreground">
            Group name
          </h3>
          {isCreator ? (
            <div className="flex items-center gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={60}
                aria-label="Group name"
                className="h-11 min-w-0 flex-1 rounded-tile border border-line bg-panel-raised px-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-accent/50"
              />
              <Button
                size="sm"
                onClick={() => void handleRename()}
                loading={busy === "rename"}
                disabled={!nameChanged || busy !== null}
                icon={<Check className="size-4" />}
              >
                Save
              </Button>
            </div>
          ) : (
            <p className="text-sm text-foreground">{group.name}</p>
          )}
        </section>

        {/* Members */}
        <section aria-labelledby="group-members-heading" className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 id="group-members-heading" className="text-sm font-medium text-foreground">
              Members
            </h3>
            {isCreator && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setAddOpen((current) => !current)}
                icon={<UserPlus className="size-4" />}
              >
                Add
              </Button>
            )}
          </div>

          {loading && members.length === 0 ? (
            <p role="status" className="text-sm text-muted">
              Loading members…
            </p>
          ) : (
            <ul className="flex list-none flex-col gap-1.5">
              {members.map((member) => (
                <li
                  key={member.user_id}
                  className="flex items-center gap-3 rounded-tile border border-line bg-panel p-2.5"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-9 shrink-0 place-items-center rounded-pill text-[10px] font-semibold text-white"
                    style={{ backgroundImage: roommateCardGradient(member.user_id) }}
                  >
                    {initialsOf(member.display_name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm text-foreground">
                      {member.display_name}
                      {member.user_id === viewerId ? " (you)" : ""}
                    </span>
                    {member.is_creator && <Badge tone="accent">Creator</Badge>}
                  {member.roommate_profile_id &&
                    blockedProfileIds.includes(member.roommate_profile_id) && (
                      <Badge tone="danger">Blocked</Badge>
                    )}
                  </span>
                  {isCreator && member.user_id !== viewerId && (
                    <IconButton
                      label={`Remove ${member.display_name} from the group`}
                      variant="plain"
                      onClick={() => void handleRemove(member)}
                      disabled={busy !== null}
                    >
                      <X className="size-4" />
                    </IconButton>
                  )}
                  {member.user_id !== viewerId && (
                    <div className="relative">
                      <IconButton
                        label={`Options for ${member.display_name}`}
                        variant="plain"
                        aria-haspopup="menu"
                        aria-expanded={menuFor === member.user_id}
                        onClick={() =>
                          setMenuFor((current) =>
                            current === member.user_id ? null : member.user_id,
                          )
                        }
                      >
                        <MoreVertical className="size-4" />
                      </IconButton>
                      {menuFor === member.user_id && (
                        <div
                          role="menu"
                          aria-label={`Options for ${member.display_name}`}
                          className="absolute top-full right-0 z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-tile border border-line bg-panel p-1 shadow-float"
                        >
                          {!member.roommate_profile_id ? (
                            <p className="px-2.5 py-2 text-[11px] leading-relaxed text-subtle">
                              {member.display_name} has no roommate profile, so there
                              is nothing to report or block here.
                            </p>
                          ) : blockedProfileIds.includes(member.roommate_profile_id) ? (
                            <p className="px-2.5 py-2 text-[11px] leading-relaxed text-subtle">
                              You have blocked {member.display_name}. Manage that from
                              Settings → Blocked roommates.
                            </p>
                          ) : (
                            <>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-panel-raised"
                                onClick={() => {
                                  setMenuFor(null);
                                  setSafetyTarget({
                                    mode: "report",
                                    profileId: member.roommate_profile_id as string,
                                    displayName: member.display_name,
                                  });
                                }}
                              >
                                <Flag
                                  className="size-3.5 shrink-0 text-subtle"
                                  aria-hidden="true"
                                />
                                Report {member.display_name}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                                onClick={() => {
                                  setMenuFor(null);
                                  setSafetyTarget({
                                    mode: "block",
                                    profileId: member.roommate_profile_id as string,
                                    displayName: member.display_name,
                                  });
                                }}
                              >
                                <ShieldAlert
                                  className="size-3.5 shrink-0 text-danger"
                                  aria-hidden="true"
                                />
                                Block {member.display_name}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isCreator && addOpen && (
            <div className="mt-1 flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-3">
              <p className="text-[11px] leading-relaxed text-subtle">
                Only people you have already talked to can be added.
              </p>
              {addable.length === 0 ? (
                <p className="text-[11px] text-subtle">
                  Everyone you have talked to is already here.
                </p>
              ) : (
                <ul className="flex list-none flex-col gap-1.5">
                  {addable.map((contact) => (
                    <li key={contact.user_id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {contact.display_name}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleAdd(contact)}
                        loading={busy === `add-${contact.user_id}`}
                        disabled={busy !== null}
                      >
                        Add
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* Leave */}
        <section aria-labelledby="group-leave-heading" className="flex flex-col gap-2 border-t border-line pt-4">
          <h3 id="group-leave-heading" className="text-sm font-medium text-foreground">
            Leave group
          </h3>
          {confirmLeave ? (
            <div className="flex flex-col gap-2 rounded-tile border border-danger/40 bg-danger/10 p-3">
              <p className="text-xs leading-relaxed text-foreground">
                {onlyMember
                  ? "You are the last member, so the group and its messages are deleted."
                  : isCreator
                    ? "The earliest remaining member becomes the creator. Your messages stay in the group."
                    : "You will stop receiving this conversation. Your messages stay in the group."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setConfirmLeave(false)}
                  disabled={busy === "leave"}
                >
                  Stay
                </Button>
                <Button
                  size="sm"
                  variant="soft"
                  onClick={() => void handleLeave()}
                  loading={busy === "leave"}
                  icon={<LogOut className="size-4" />}
                >
                  Leave group
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-[60%] text-[11px] leading-relaxed text-subtle">
                {onlyMember
                  ? "You are the only member left; leaving deletes the group."
                  : "You can come back if someone adds you again."}
              </p>
              <Button
                size="sm"
                variant="ghost"
                className={cn("text-danger")}
                onClick={() => setConfirmLeave(true)}
                icon={<LogOut className="size-4" />}
              >
                Leave group
              </Button>
            </div>
          )}
        </section>
      </div>

      <RoommateSafetySheet
        open={Boolean(safetyTarget)}
        mode={safetyTarget?.mode ?? "report"}
        onClose={() => setSafetyTarget(null)}
        profileId={safetyTarget?.profileId ?? ""}
        displayName={safetyTarget?.displayName ?? "this roommate"}
        viewerId={viewerId}
        onBlocked={() => {
          if (safetyTarget) handleBlocked(safetyTarget);
        }}
      />
    </BottomSheet>
  );
}
