import { Check, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import {
  createChatGroup,
  defaultGroupName,
  GROUP_MIN_MEMBERS,
  GROUP_NAME_MAX_LENGTH,
  loadChatContacts,
  type ChatContact,
  type ChatContactKind,
} from "@/chat/groups";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import {
  initialsOf,
  roommateCardGradient,
} from "@/roommates/roommate-profiles";

const kindLabels: Record<ChatContactKind, string> = {
  roommate: "Roommate",
  agent: "Agent",
  landlord: "Property owner",
  student: "Student",
};

export type CreateGroupSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Called with the new group so the inbox can open it straight away. */
  onCreated: (group: {
    groupId: string;
    name: string;
    memberNames: string;
  }) => void;
};

/**
 * Step one of a group: pick who is in it.
 *
 * Only people the viewer has actually conversed with appear here — the contact
 * list comes from chat_contacts(), and create_chat_group() re-checks every pick
 * server-side. A group needs at least two other people.
 */
export function CreateGroupSheet({
  open,
  onClose,
  onCreated,
}: CreateGroupSheetProps) {
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // A fresh sheet every time: stale picks from a previous open would confuse.
  useEffect(() => {
    if (!open) return;

    setSelected([]);
    setName("");
    setCreateError(null);

    const client = supabase;
    if (!client) {
      setContacts([]);
      setLoadError("Sign in to start a group.");
      return;
    }

    let active = true;
    setLoading(true);
    setLoadError(null);

    void loadChatContacts(client).then((result) => {
      if (!active) return;
      setContacts(result.contacts);
      setLoadError(result.error);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [open]);

  function toggle(userId: string) {
    setCreateError(null);
    setSelected((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }

  async function handleCreate() {
    const client = supabase;
    if (!client || creating) return;

    const pickedNames = contacts
      .filter((contact) => selected.includes(contact.user_id))
      .map((contact) => contact.display_name);
    const groupName = name.trim() || defaultGroupName(pickedNames);

    setCreating(true);
    setCreateError(null);
    const result = await createChatGroup(client, {
      name: groupName,
      memberIds: selected,
    });
    setCreating(false);

    if (result.error || !result.groupId) {
      setCreateError(result.error ?? "Could not create the group.");
      return;
    }

    onCreated({
      groupId: result.groupId,
      name: groupName,
      memberNames: pickedNames.join(", "),
    });
  }

  const ready = selected.length >= GROUP_MIN_MEMBERS;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Create a group"
      footer={
        <div className="flex flex-col gap-2">
          <label htmlFor="group-name" className="sr-only">
            Group name
          </label>
          <input
            id="group-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={GROUP_NAME_MAX_LENGTH}
            placeholder={
              selected.length > 0
                ? defaultGroupName(
                    contacts
                      .filter((contact) => selected.includes(contact.user_id))
                      .map((contact) => contact.display_name),
                  )
                : "Group name (optional)"
            }
            className="h-11 w-full rounded-tile border border-line bg-panel-raised px-3 text-sm text-foreground placeholder:text-subtle focus-visible:border-accent/50"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-subtle">
              {selected.length === 0
                ? `Choose at least ${GROUP_MIN_MEMBERS} people`
                : `${selected.length} selected · ${GROUP_MIN_MEMBERS} minimum`}
            </p>
            <Button
              onClick={() => void handleCreate()}
              loading={creating}
              disabled={!ready}
              icon={<UsersRound className="size-4" />}
            >
              Create group
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-relaxed text-muted">
          Only people you have already talked to can join. Everyone sees the
          same messages once the group starts.
        </p>

        {createError && <InlineAlert>{createError}</InlineAlert>}
        {loadError && <InlineAlert>{loadError}</InlineAlert>}

        {loading && (
          <p role="status" className="text-sm text-muted">
            Loading your contacts…
          </p>
        )}

        {!loading && !loadError && contacts.length === 0 && (
          <p className="text-sm leading-relaxed text-muted">
            No one to add yet. Message a lister about a room, or connect with a
            roommate, and they show up here.
          </p>
        )}

        {contacts.length > 0 && (
          <ul className="flex list-none flex-col gap-2">
            {contacts.map((contact) => {
              const picked = selected.includes(contact.user_id);
              return (
                <li key={contact.user_id}>
                  <button
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggle(contact.user_id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-tile border p-3 text-left transition-colors",
                      picked
                        ? "border-accent/50 bg-accent/12"
                        : "border-line bg-panel hover:border-line-strong",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-10 shrink-0 place-items-center rounded-pill text-xs font-semibold text-white"
                      style={{ backgroundImage: roommateCardGradient(contact.user_id) }}
                    >
                      {initialsOf(contact.display_name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium text-foreground">
                        {contact.display_name}
                      </span>
                      <span className="truncate text-[11px] text-subtle">
                        {kindLabels[contact.kind] ?? "Contact"}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-pill border transition-colors",
                        picked
                          ? "border-accent bg-accent text-accent-ink"
                          : "border-line-strong text-transparent",
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}
