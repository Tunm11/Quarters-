import {
  ArrowLeft,
  Briefcase,
  Handshake,
  House,
  Inbox,
  MessageCircle,
  RefreshCw,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import { signChatImageUrls } from "@/chat/media";
import { useChatGroups } from "@/chat/use-chat-groups";
import { CreateGroupSheet } from "@/components/chat/create-group-sheet";
import { GroupChatSheet } from "@/components/chat/group-chat-sheet";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { OfflineCopyNotice } from "@/components/feedback/offline-banner";
import { ListingChatSheet } from "@/components/listings/listing-chat-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { iconButtonClasses } from "@/components/ui/icon-button";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import type { StudentListingChatThread } from "@/listings/listing-messages";
import { useStudentListingChatThreads } from "@/listings/use-student-listing-threads";
import {
  formatRoommateLocation,
  initialsOf,
  roommateCardGradient,
} from "@/roommates/roommate-profiles";
import { useRoommateConnections } from "@/roommates/use-roommate-connections";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Who the inbox is showing: everyone, or one side of the conversation list. */
type InboxFilter = "all" | "groups" | "roommates" | "agents" | "owners";

const inboxFilters: { id: InboxFilter; label: string; icon: typeof Inbox }[] = [
  { id: "all", label: "All", icon: Inbox },
  { id: "groups", label: "Groups", icon: UsersRound },
  { id: "roommates", label: "Roommates", icon: UsersRound },
  { id: "agents", label: "Agents", icon: Briefcase },
  { id: "owners", label: "Property owners", icon: House },
];

/**
 * The messages inbox: every conversation a student has, in one place.
 *
 * Two surfaces feed it — rooms they asked a lister about, and roommates they are
 * connected to. Each row opens the same thread the rest of the app uses, so an
 * unread reply is one tap away from here.
 */
export default function MessagesPage() {
  const { user } = useAuth();
  const {
    connections,
    status: connectionsStatus,
    error: connectionsError,
    offlineSavedAt: connectionsOfflineSavedAt,
  } = useRoommateConnections();
  const {
    threads,
    status: threadsStatus,
    error: threadsError,
    offlineSavedAt: threadsOfflineSavedAt,
    reload: reloadThreads,
  } = useStudentListingChatThreads({ enabled: Boolean(user) });
  const [openThread, setOpenThread] = useState<StudentListingChatThread | null>(
    null,
  );
  const {
    groups,
    status: groupsStatus,
    error: groupsError,
    offlineSavedAt: groupsOfflineSavedAt,
    reload: reloadGroups,
  } = useChatGroups({ enabled: Boolean(user) });
  // Whichever list was read from the cache: one notice covers the inbox.
  const offlineSavedAt =
    threadsOfflineSavedAt ?? groupsOfflineSavedAt ?? connectionsOfflineSavedAt;
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<{
    groupId: string;
    name: string;
    memberNames?: string;
    createdBy: string;
    avatarPath: string | null;
  } | null>(null);
  const [groupAvatarUrls, setGroupAvatarUrls] = useState<Map<string, string>>(
    () => new Map(),
  );

  // Group pictures are private objects, so each path needs a signed URL.
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const paths = groups
      .map((group) => group.avatar_path)
      .filter((path): path is string => Boolean(path));
    if (paths.length === 0) {
      setGroupAvatarUrls(new Map());
      return;
    }

    let active = true;
    void signChatImageUrls(client, paths).then((urls) => {
      if (active) setGroupAvatarUrls(urls);
    });
    return () => {
      active = false;
    };
  }, [groups]);

  // Renames, pictures and membership changes land on the next groups reload;
  // keep the open conversation pointing at the fresh row.
  const openGroupId = openGroup?.groupId ?? null;
  useEffect(() => {
    if (!openGroupId) return;
    const fresh = groups.find((group) => group.group_id === openGroupId);
    if (!fresh) return;

    setOpenGroup((current) => {
      if (!current || current.groupId !== fresh.group_id) return current;
      if (
        current.name === fresh.name &&
        current.memberNames === fresh.member_names &&
        current.createdBy === fresh.created_by &&
        current.avatarPath === fresh.avatar_path
      ) {
        return current;
      }
      return {
        groupId: fresh.group_id,
        name: fresh.name,
        memberNames: fresh.member_names,
        createdBy: fresh.created_by,
        avatarPath: fresh.avatar_path,
      };
    });
  }, [groups, openGroupId]);

  const loading =
    threadsStatus === "loading" ||
    connectionsStatus === "loading" ||
    groupsStatus === "loading";
  const hasConversations =
    threads.length > 0 || connections.length > 0 || groups.length > 0;
  const isEmpty =
    threadsStatus === "ready" &&
    connectionsStatus === "ready" &&
    groupsStatus === "ready" &&
    !hasConversations;

  // "Agents" and "Property owners" both come from room threads; the roommate
  // filter hides those and shows connections only.
  const showRoomThreads =
    filter === "all" || filter === "agents" || filter === "owners";
  const showGroups = filter === "all" || filter === "groups";
  const visibleGroups = showGroups ? groups : [];
  const visibleThreads = showRoomThreads
    ? threads.filter((thread) =>
        filter === "all"
          ? true
          : filter === "agents"
            ? thread.provider_kind === "agent"
            : thread.provider_kind === "landlord",
      )
    : [];
  const showConnections = filter === "all" || filter === "roommates";
  const visibleConnections = showConnections ? connections : [];

  const roomsSectionVisible =
    visibleThreads.length > 0 || (showRoomThreads && threadsStatus === "error");
  const roommatesSectionVisible =
    visibleConnections.length > 0 ||
    (showConnections && connectionsStatus === "error");
  const groupsSectionVisible =
    visibleGroups.length > 0 ||
    (showGroups && groupsStatus === "error");
  const filteredEmpty =
    !loading &&
    hasConversations &&
    !roomsSectionVisible &&
    !roommatesSectionVisible &&
    !groupsSectionVisible;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      {offlineSavedAt && <OfflineCopyNotice savedAt={offlineSavedAt} />}

      <header className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium tracking-[0.18em] text-sand uppercase">
            Inbox
          </span>
          <Link
            to="/"
            aria-label="Back to Home"
            className={iconButtonClasses({ variant: "outline" })}
          >
            <ArrowLeft className="size-4" />
          </Link>
        </div>
        <div>
          <h1
            id="messages-heading"
            className="text-[1.9rem] leading-[1.08] font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Messages
          </h1>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">
            Your conversations with listers and connected roommates, newest first.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <div
          role="group"
          aria-label="Filter conversations"
          className="-mx-5 flex items-center gap-2 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {inboxFilters.map((option) => {
            const Icon = option.icon;
            return (
              <FilterChip
                key={option.id}
                label={option.label}
                icon={Icon}
                active={filter === option.id}
                opensSheet={false}
                onClick={() => setFilter(option.id)}
              />
            );
          })}
          <button
            type="button"
            onClick={() => setCreateGroupOpen(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-pill border border-accent/40 bg-accent/12 px-4 text-xs font-medium text-accent-soft transition-colors select-none hover:border-accent/60 hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-soft active:bg-accent/25"
          >
            <UsersRound className="size-4 shrink-0" aria-hidden="true" />
            <span className="whitespace-nowrap">Create group</span>
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-sm text-muted">
            Loading your conversations…
          </p>
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="flex items-center gap-3 rounded-tile border border-line bg-panel p-3"
            >
              <Skeleton className="size-10 rounded-pill" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && isEmpty && filter === "all" && (
        <EmptyState
          icon={MessageCircle}
          title="No conversations yet"
          description="Ask a lister about a room, or connect with a roommate, and the thread appears here."
          action={
            <Link
              to="/explore"
              className={iconButtonClasses({
                variant: "outline",
                className: "w-auto gap-2 px-4 text-sm font-medium",
              })}
            >
              <House className="size-4" aria-hidden="true" />
              Browse rooms
            </Link>
          }
        />
      )}

      {!loading && filteredEmpty && (
        <p className="rounded-tile border border-dashed border-line bg-panel/60 px-4 py-6 text-center text-sm leading-relaxed text-muted">
          {filter === "roommates"
            ? "No roommate conversations yet. Connect with a roommate and say hello."
            : filter === "groups"
              ? "No group chats yet. Tap Create group to start one with people you have talked to."
              : `No conversations with ${filter === "agents" ? "agents" : "property owners"} yet. Ask about a room and the thread appears here.`}
        </p>
      )}

      {/* Groups: shared conversations with several contacts. */}
      {!loading && groupsSectionVisible && (
        <section aria-labelledby="groups-heading" className="flex flex-col gap-3">
          <SectionHeading id="groups-heading" eyebrow="Together" title="Groups" />
          {groupsStatus === "error" && (
            <div className="flex flex-col gap-3">
              <InlineAlert>{groupsError}</InlineAlert>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => void reloadGroups()}
                icon={<RefreshCw className="size-4" />}
              >
                Try again
              </Button>
            </div>
          )}
          <ul className="flex list-none flex-col gap-2.5">
            {visibleGroups.map((group) => (
              <li key={group.group_id}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenGroup({
                      groupId: group.group_id,
                      name: group.name,
                      memberNames: group.member_names,
                      createdBy: group.created_by,
                      avatarPath: group.avatar_path,
                    })
                  }
                  className="flex w-full items-start gap-3 rounded-tile border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-pill bg-accent/12 text-accent-soft"
                  >
                    {group.avatar_path &&
                    groupAvatarUrls.get(group.avatar_path) ? (
                      <img
                        src={groupAvatarUrls.get(group.avatar_path)}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <UsersRound className="size-4" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {group.name}
                      </span>
                      {group.last_message_at && (
                        <span className="shrink-0 text-[10px] text-subtle">
                          {timeFormatter.format(new Date(group.last_message_at))}
                        </span>
                      )}
                    </span>
                    <span className="truncate text-[11px] text-muted">
                      {`${group.member_count} ${group.member_count === 1 ? "member" : "members"} · ${group.member_names}`}
                    </span>
                    <span className="truncate text-[11px] text-subtle">
                      {group.last_body || "No messages yet"}
                    </span>
                  </span>
                  {group.unread_count > 0 && (
                    <Badge tone="accent">{`${group.unread_count} new`}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Room conversations: the student's own threads with listers. */}
      {!loading && roomsSectionVisible && (
        <section aria-labelledby="rooms-heading" className="flex flex-col gap-3">
          <SectionHeading id="rooms-heading" eyebrow="Rooms" title="Listers" />
          {threadsStatus === "error" && (
            <div className="flex flex-col gap-3">
              <InlineAlert>{threadsError}</InlineAlert>
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                onClick={() => void reloadThreads()}
                icon={<RefreshCw className="size-4" />}
              >
                Try again
              </Button>
            </div>
          )}
          <ul className="flex list-none flex-col gap-2.5">
            {visibleThreads.map((thread) => (
              <li key={thread.listing_id}>
                <button
                  type="button"
                  onClick={() => setOpenThread(thread)}
                  className="flex w-full items-start gap-3 rounded-tile border border-line bg-panel p-3 text-left transition-colors hover:border-line-strong"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
                  >
                    {thread.provider_kind === "agent" ? (
                      <Briefcase className="size-4" />
                    ) : (
                      <House className="size-4" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {thread.provider_name}
                      </span>
                      <span className="shrink-0 text-[10px] text-subtle">
                        {timeFormatter.format(new Date(thread.last_message_at))}
                      </span>
                    </span>
                    <span className="truncate text-[11px] text-muted">
                      {thread.provider_kind === "agent"
                        ? "Agent"
                        : "Property owner"}{" · "}
                      {thread.listing_title}
                    </span>
                    <span className="truncate text-[11px] text-subtle">
                      {thread.last_body}
                    </span>
                  </span>
                  {thread.unread_count > 0 && (
                    <Badge tone="accent">{`${thread.unread_count} new`}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Roommate conversations: one tap into the connected chat. */}
      {!loading && roommatesSectionVisible && (
        <section
          aria-labelledby="roommates-messages-heading"
          className="flex flex-col gap-3"
        >
          <SectionHeading
            id="roommates-messages-heading"
            eyebrow="Roommates"
            title="Connections"
          />
          {connectionsStatus === "error" && <InlineAlert>{connectionsError}</InlineAlert>}
          <ul className="flex list-none flex-col gap-2.5">
            {visibleConnections.map((connection) => (
              <li key={connection.id}>
                <Link
                  to={`/roommate/${connection.id}?chat=1`}
                  aria-label={`Chat with ${connection.display_name}`}
                  className="flex items-center gap-3 rounded-tile border border-line bg-panel p-3 transition-colors hover:border-line-strong"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-pill text-xs font-semibold text-white"
                    style={{ backgroundImage: roommateCardGradient(connection.id) }}
                  >
                    {connection.avatar_url ? (
                      <img
                        src={connection.avatar_url}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      initialsOf(connection.display_name)
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">
                      {connection.display_name}
                    </span>
                    <span className="truncate text-[11px] text-subtle">
                      {formatRoommateLocation(connection)} · Connected
                    </span>
                  </span>
                  <Handshake className="size-4 shrink-0 text-accent-soft" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {user && (
        <CreateGroupSheet
          open={createGroupOpen}
          onClose={() => setCreateGroupOpen(false)}
          onCreated={(group) => {
            setCreateGroupOpen(false);
            setOpenGroup({
              ...group,
              createdBy: user.id,
              avatarPath: null,
            });
            void reloadGroups();
          }}
        />
      )}

      {user && (
        <GroupChatSheet
          open={Boolean(openGroup)}
          onClose={() => setOpenGroup(null)}
          group={openGroup}
          viewerId={user.id}
          avatarUrl={
            openGroup?.avatarPath
              ? groupAvatarUrls.get(openGroup.avatarPath) ?? null
              : null
          }
          onGroupChanged={() => void reloadGroups()}
          onLeft={() => {
            setOpenGroup(null);
            void reloadGroups();
          }}
        />
      )}

      {user && openThread && (
        <ListingChatSheet
          open
          onClose={() => setOpenThread(null)}
          listingId={openThread.listing_id}
          listingTitle={openThread.listing_title}
          studentId={user.id}
          viewerId={user.id}
          peerLabel={openThread.provider_name}
        />
      )}
    </div>
  );
}
