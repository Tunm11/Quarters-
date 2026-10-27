import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  Camera,
  Clock3,
  Copy,
  Flag,
  GraduationCap,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pencil,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldOff,
  Sparkles,
  Undo2,
  X,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "@/auth/use-auth";
import {
  MessageActionsSheet,
  MessageOptionsButton,
} from "@/components/chat/message-actions-sheet";
import {
  MessageSearchBar,
  filterMessagesByQuery,
} from "@/components/chat/message-search";
import { typingLabel, useTypingIndicator } from "@/chat/typing";
import {
  ChatComposer,
  type ChatComposerSendInput,
} from "@/components/chat/chat-composer";
import { ErrorState } from "@/components/feedback/error-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import {
  ChatThreadSkeleton,
  RoommateProfileSkeleton,
} from "@/components/feedback/skeletons";
import { Badge } from "@/components/ui/badge";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, buttonClasses } from "@/components/ui/button";
import { IconButton, iconButtonClasses } from "@/components/ui/icon-button";
import { PlanGroupVisitSheet } from "@/components/listings/plan-group-visit-sheet";
import { EditRoommateProfileSheet } from "@/components/roommates/edit-roommate-profile-sheet";
import {
  RoommateSafetySheet,
  type RoommateSafetyMode,
} from "@/components/roommates/roommate-safety-sheet";
import { SharedListingCard } from "@/components/roommates/shared-listing-card";
import { SharedShortlistCard } from "@/components/roommates/shared-shortlist-card";
import { cn } from "@/lib/cn";
import { signChatImageUrls } from "@/chat/media";
import { loadListingsByIds, type PublicListing } from "@/listings/public-listings";
import { supabase } from "@/lib/supabase";
import { loadMyGroupVisit } from "@/roommates/listing-shares";
import {
  MESSAGE_MAX_LENGTH,
  loadMyInterest,
  loadRoommateMessages,
  markRoommateMessagesRead,
  sendRoommateInterest,
  sendRoommateMessage,
  withdrawRoommateInterest,
  type RoommateInterestSummary,
  type RoommateMessage,
} from "@/roommates/roommate-detail";
import {
  formatMoveIn,
  formatRoommateBudget,
  formatRoommateBudgetShort,
  formatRoommateGender,
  formatRoommateLocation,
  initialsOf,
  roommateCardGradient,
  type RoommateProfile,
} from "@/roommates/roommate-profiles";
import {
  loadMyBlockForProfile,
  unblockRoommate,
} from "@/roommates/safety";
import { useMyRoommateProfile } from "@/roommates/use-my-roommate-profile";
import { useRoommateMessagesChannel } from "@/roommates/use-roommate-messages-channel";
import { useRoommateProfile } from "@/roommates/use-roommate-profile";
import { useRoommateVerification } from "@/roommates/use-roommate-verification";
import {
  compatibilityBreakdown,
  compatibilityScore,
  compatibilityVerdict,
} from "@/roommates/verification";

const messageTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Chat preference, kept on this device: the thread is otherwise timestamped. */
const SHOW_MESSAGE_TIMES_KEY = "quarters.roommate-chat.show-times";

function loadShowMessageTimes(): boolean {
  try {
    return window.localStorage.getItem(SHOW_MESSAGE_TIMES_KEY) === "1";
  } catch {
    return false;
  }
}

function saveShowMessageTimes(value: boolean): void {
  try {
    window.localStorage.setItem(SHOW_MESSAGE_TIMES_KEY, value ? "1" : "0");
  } catch {
    // Private browsing or a full quota: the setting simply does not persist.
  }
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel"
    >
      <h2 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-tile border border-line bg-panel-raised text-accent-soft"
      >
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="text-[10px] tracking-[0.14em] text-subtle uppercase">
          {label}
        </span>
        <span className="text-xs font-medium break-words text-foreground">
          {value}
        </span>
      </span>
    </div>
  );
}

export default function RoommatePage() {
  const { id } = useParams<{ id: string }>();
  const { profile, status, error, reload } = useRoommateProfile(id ?? "");

  if (status === "loading") {
    return (
      <>
        <p role="status" className="sr-only">
          Loading this profile
        </p>
        <RoommateProfileSkeleton />
      </>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-8 sm:px-6">
        <ErrorState
          title="This profile could not be loaded"
          description={error ?? "Please try again in a moment."}
          action={
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void reload()}
                icon={<RefreshCw className="size-4" />}
              >
                Try again
              </Button>
              <Link
                to="/roommates"
                className={buttonClasses({ variant: "ghost", size: "sm" })}
              >
                Back to roommates
              </Link>
            </>
          }
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-6 pb-8 sm:px-6">
        <ErrorState
          title="This profile is not available"
          description="It may have been hidden by its owner. Only discoverable roommate profiles are visible."
          action={
            <Link to="/roommates" className={buttonClasses({ size: "sm" })}>
              Browse roommate profiles
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        />
      </div>
    );
  }

  return <RoommateDetail profile={profile} onProfileChanged={() => void reload()} />;
}

function RoommateDetail({
  profile,
  onProfileChanged,
}: {
  profile: RoommateProfile;
  /** Called after the owner edits the profile, so the screen re-reads it. */
  onProfileChanged?: () => void;
}) {
  const { status: authStatus, user, avatarUrl, uploadAvatar, removeAvatar } = useAuth();
  const { traits: viewerTraits, standing } = useRoommateVerification();
  // The owner's own row lets this screen tell "your profile" from someone
  // else's, so it can offer photo and edit controls instead of interest/chat.
  const { profile: myProfile } = useMyRoommateProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  // Connections open this screen with ?chat=1 so a connected roommate lands in
  // the conversation instead of at the top of their profile.
  const openChatOnLoad = searchParams.get("chat") === "1";

  const [interest, setInterest] = useState<RoommateInterestSummary | null>(null);
  const [interestError, setInterestError] = useState<string | null>(null);
  const [interestPending, setInterestPending] = useState(false);
  const [cancelInterestOpen, setCancelInterestOpen] = useState(false);
  const [cancellingInterest, setCancellingInterest] = useState(false);
  const [safetyMode, setSafetyMode] = useState<RoommateSafetyMode | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [unblocking, setUnblocking] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(openChatOnLoad);
  const [editOpen, setEditOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // True once the owner removes their photo here, so the stale signed URL from
  // the profile row does not linger until the next reload.
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<RoommateMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(() => new Map());
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMessageTimes, setShowMessageTimes] = useState(loadShowMessageTimes);
  const [menuNote, setMenuNote] = useState<string | null>(null);
  const [actionsFor, setActionsFor] = useState<RoommateMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sharedListings, setSharedListings] = useState<Map<string, PublicListing>>(
    () => new Map(),
  );
  // Party size per property: how many people the visit was asked for, so a
  // three-person request does not read like a pair.
  const [groupVisitRequested, setGroupVisitRequested] = useState<
    Record<string, number>
  >({});
  const [groupVisitListing, setGroupVisitListing] = useState<PublicListing | null>(
    null,
  );
  // Older replies are discarded when a newer load starts or the sheet closes.
  const messageRequestId = useRef(0);

  const signedIn = authStatus === "signedIn" && Boolean(user);
  const isOwnProfile = Boolean(myProfile && myProfile.id === profile.id);
  // The owner sees the photo they just picked straight from the auth provider,
  // so uploading does not need a full profile reload to show up. Before that
  // signed URL resolves, the photo this screen already loaded stands in.
  const heroPhoto = isOwnProfile
    ? (avatarUrl ?? (photoRemoved ? null : profile.avatar_url))
    : profile.avatar_url;
  const budget =
    profile.budget_amount != null
      ? formatRoommateBudget(profile.budget_amount)
      : null;
  const budgetShort =
    profile.budget_amount != null
      ? formatRoommateBudgetShort(profile.budget_amount)
      : null;
  const moveIn = formatMoveIn(profile.move_in_date);
  const location_ = formatRoommateLocation(profile);
  const compatibility = compatibilityScore(viewerTraits, profile.traits);
  const verdict = compatibility != null ? compatibilityVerdict(compatibility) : null;
  const breakdown = compatibilityBreakdown(viewerTraits, profile.traits);
  const firstName = profile.display_name.trim().split(/\s+/)[0];
  // A withdrawn or declined interest no longer sits in the way of sending one.
  const interestActive =
    interest != null &&
    interest.status !== "withdrawn" &&
    interest.status !== "declined";
  // Only an unanswered interest can be cancelled; a connection is kept.
  const canCancelInterest = interest != null && interest.status === "pending";

  // Opening ?chat=1 on your own profile would start a thread with yourself.
  useEffect(() => {
    if (isOwnProfile) setChatOpen(false);
  }, [isOwnProfile]);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    const result = await uploadAvatar(file);
    setPhotoBusy(false);
    if (result.error) {
      setPhotoError(result.error);
    } else {
      setPhotoRemoved(false);
    }
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  async function handleRemovePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    const result = await removeAvatar();
    setPhotoBusy(false);
    if (result.error) {
      setPhotoError(result.error);
    } else {
      setPhotoRemoved(true);
    }
  }

  useEffect(() => {
    if (!signedIn || !supabase) return;
    let active = true;
    void loadMyInterest(supabase, profile.id).then((result) => {
      if (active && result.interest) setInterest(result.interest);
    });
    return () => {
      active = false;
    };
  }, [signedIn, profile.id]);

  const viewerId = user?.id ?? null;

  // A block normally sends the student back to discovery, but a stale tab can
  // still hold this page open. Reflect the block so interest and chat stay off.
  useEffect(() => {
    if (!signedIn || !viewerId || !supabase) return;
    let active = true;
    void loadMyBlockForProfile(supabase, {
      blockerId: viewerId,
      profileId: profile.id,
    }).then((result) => {
      if (active && result.blocked) setBlockedByMe(true);
    });
    return () => {
      active = false;
    };
  }, [profile.id, signedIn, viewerId]);

  const typing = useTypingIndicator({
    kind: "roommate",
    conversationId: profile.id,
    viewerId,
    enabled: chatOpen && signedIn,
  });
  const visibleMessages = filterMessagesByQuery(
    messages,
    searchOpen ? query : "",
  );

  const reloadMessages = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!supabase || !viewerId) return;

      const request = messageRequestId.current + 1;
      messageRequestId.current = request;
      if (!silent) setMessagesLoading(true);
      setMessagesError(null);

      const result = await loadRoommateMessages(supabase, profile.id);
      if (request !== messageRequestId.current) return;

      setMessages(result.messages);
      setMessagesError(result.error);
      setMessagesLoading(false);

      // Opening the thread is what makes the other side's copy show "Seen".
      if (!result.error) {
        await markRoommateMessagesRead(supabase, profile.id, viewerId);
      }
    },
    [profile.id, viewerId],
  );

  useEffect(() => {
    if (!chatOpen || !signedIn) return;
    void reloadMessages();
  }, [chatOpen, signedIn, reloadMessages]);

  // A closed sheet opens clean: no stale search narrowing the thread.
  useEffect(() => {
    if (chatOpen) return;
    setSearchOpen(false);
    setQuery("");
  }, [chatOpen]);

  // Property cards and shared shortlists need the public listing summary
  // (photo, title, rent); a single shared card also carries whether this
  // student already asked the lister for a joint visit.
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const cardIds = [
      ...new Set(
        messages
          .map((message) => message.shared_listing_id)
          .filter((listingId): listingId is string => Boolean(listingId)),
      ),
    ];
    const listingIds = [
      ...new Set([
        ...cardIds,
        ...messages.flatMap((message) => message.shared_listing_ids ?? []),
      ]),
    ];
    if (listingIds.length === 0) return;

    let active = true;
    void loadListingsByIds(client, listingIds).then((listings) => {
      if (active) setSharedListings(listings);
    });
    void Promise.all(
      cardIds.map((listingId) =>
        viewerId
          ? loadMyGroupVisit(client, { listingId, viewerId })
          : Promise.resolve({ partySize: null, error: null }),
      ),
    ).then((results) => {
      if (!active) return;
      const requested: Record<string, number> = {};
      cardIds.forEach((listingId, index) => {
        const partySize = results[index]?.partySize;
        if (partySize) requested[listingId] = partySize;
      });
      setGroupVisitRequested(requested);
    });

    return () => {
      active = false;
    };
  }, [messages, viewerId]);

  // Photos in this thread are private objects; each one needs its own signed
  // URL before it can render.
  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const paths = messages
      .map((message) => message.image_path)
      .filter((path): path is string => Boolean(path));
    if (paths.length === 0) {
      setImageUrls(new Map());
      return;
    }

    let active = true;
    void signChatImageUrls(client, paths).then((urls) => {
      if (active) setImageUrls(urls);
    });

    return () => {
      active = false;
    };
  }, [messages]);

  // The thread is live while it is open: both messages and read receipts arrive
  // over Realtime, so a reply lands without a manual refresh.
  useRoommateMessagesChannel({
    profileId: profile.id,
    enabled: chatOpen && signedIn,
    onChange: () => {
      void reloadMessages({ silent: true });
    },
  });

  // A quiet refresh when the tab regains focus covers the gap if the socket was
  // asleep (backgrounded tab, flaky network) while the other side wrote.
  useEffect(() => {
    if (!chatOpen || !signedIn) return;
    function handleFocus() {
      void reloadMessages({ silent: true });
    }
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      messageRequestId.current += 1;
    };
  }, [chatOpen, signedIn, reloadMessages]);

  function requireSignIn(): boolean {
    if (signedIn) return true;
    navigate(`/auth?returnTo=${encodeURIComponent(location.pathname)}`);
    return false;
  }

  async function handleSendInterest() {
    setInterestError(null);
    if (!requireSignIn() || !user) return;
    if (!supabase) {
      setInterestError("Interest cannot be sent because Supabase is not configured.");
      return;
    }

    setInterestPending(true);
    const result = await sendRoommateInterest(supabase, profile.id, user.id);
    setInterestPending(false);

    if (result.error) {
      setInterestError(result.error);
      return;
    }
    setInterest(result.interest);
    setCancelInterestOpen(false);
  }

  async function handleCancelInterest() {
    setInterestError(null);
    if (!requireSignIn() || !supabase || !interest) return;

    setCancellingInterest(true);
    const result = await withdrawRoommateInterest(supabase, interest.id);
    setCancellingInterest(false);

    if (result.error) {
      setInterestError(result.error);
      return;
    }
    setInterest(null);
    setCancelInterestOpen(false);
  }

  function handleOpenChat() {
    if (blockedByMe || !requireSignIn()) return;
    setChatOpen(true);
  }

  function openSafety(mode: RoommateSafetyMode) {
    if (!requireSignIn()) return;
    setSafetyError(null);
    setSafetyMode(mode);
  }

  function handleBlocked() {
    setSafetyMode(null);
    closeChat();
    navigate("/roommates", {
      replace: true,
      state: {
        notice: `You blocked ${firstName}. You can undo this from Settings → Privacy & data.`,
      },
    });
  }

  async function handleUnblock() {
    setSafetyError(null);
    if (!requireSignIn() || !supabase || !viewerId) return;

    setUnblocking(true);
    const result = await unblockRoommate(supabase, {
      blockerId: viewerId,
      profileId: profile.id,
    });
    setUnblocking(false);

    if (result.error) {
      setSafetyError(result.error);
      return;
    }
    setBlockedByMe(false);
  }

  function closeChat() {
    setChatOpen(false);
    setMenuOpen(false);
    setMenuNote(null);
  }

  function toggleMessageTimes() {
    setShowMessageTimes((current) => {
      const next = !current;
      saveShowMessageTimes(next);
      return next;
    });
  }

  async function handleCopyProfileLink() {
    const url = `${window.location.origin}/roommate/${profile.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setMenuNote("Profile link copied.");
    } catch {
      setMenuNote(url);
    }
  }

  function handleGroupVisitRequested(listingId: string, partySize: number) {
    setGroupVisitRequested((current) => ({ ...current, [listingId]: partySize }));
  }

  async function handleSendMessage(
    input: ChatComposerSendInput,
  ): Promise<string | null> {
    setMessagesError(null);
    if (!requireSignIn() || !user) {
      return "Sign in to continue this conversation.";
    }
    const client = supabase;
    if (!client) {
      return "Chat is unavailable because Supabase is not configured.";
    }

    setSending(true);
    const result = await sendRoommateMessage(client, {
      profileId: profile.id,
      studentId: user.id,
      senderId: user.id,
      body: input.body,
      sharedListingId: input.sharedListingId,
      imagePath: input.imagePath,
    });
    setSending(false);

    if (result.error) return result.error;
    const sent = result.message;
    if (sent) setMessages((current) => [...current, sent]);
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-2xl pb-6">
      <div className="relative">
        <div className="relative aspect-[4/3] overflow-hidden bg-panel-raised sm:mt-4 sm:rounded-sheet">
          {heroPhoto ? (
            <img
              src={heroPhoto}
              alt=""
              className="size-full object-cover object-center"
            />
          ) : (
            <div
              className="grid size-full place-items-center"
              style={{ backgroundImage: roommateCardGradient(profile.id) }}
            >
              <span
                aria-hidden="true"
                className="text-5xl font-semibold tracking-tight text-white/80"
              >
                {initialsOf(profile.display_name)}
              </span>
            </div>
          )}

          <div className="absolute inset-x-3 top-3">
            <Link
              to="/roommates"
              aria-label="Back to roommate profiles"
              className={iconButtonClasses({
                variant: "outline",
                className:
                  "border-transparent bg-panel/90 text-foreground shadow-panel backdrop-blur-sm",
              })}
            >
              <ArrowLeft className="size-5" />
            </Link>
          </div>

          {budgetShort && (
            <span className="absolute right-3 bottom-3 rounded-pill bg-panel/92 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur-sm">
              {budgetShort}
              <span className="font-normal text-muted">/yr</span>
            </span>
          )}
        </div>

        <div className="relative -mt-6 rounded-t-sheet bg-panel px-4 pt-5 pb-4 sm:mx-3 sm:rounded-sheet sm:border sm:border-line sm:shadow-panel">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1
                id="roommate-heading"
                className="text-xl leading-snug font-semibold tracking-tight text-balance text-foreground"
              >
                {profile.display_name}
              </h1>
              {location_ && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{location_}</span>
                </p>
              )}
              {formatRoommateGender(profile) && (
                <p className="text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">
                  {formatRoommateGender(profile)}
                </p>
              )}
              {profile.institution && (
                <p className="flex items-center gap-1.5 text-xs text-subtle">
                  <GraduationCap className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{profile.institution}</span>
                </p>
              )}
            </div>
            <Badge tone="outline" className="shrink-0">
              {isOwnProfile ? "Your profile" : "Looking now"}
            </Badge>
          </div>

          {profile.headline && (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {profile.headline}
            </p>
          )}

          <ul className="mt-4 grid grid-cols-2 gap-3 rounded-tile border border-line bg-panel-raised p-3">
            <Fact
              icon={Wallet}
              label="Budget"
              value={budget ? `${budget}/year` : "Not stated"}
            />
            <Fact
              icon={CalendarClock}
              label="Move in"
              value={moveIn ?? "Flexible"}
            />
            <Fact
              icon={GraduationCap}
              label="Campus"
              value={profile.institution ?? "Not stated"}
            />
            <Fact
              icon={MapPin}
              label="Area"
              value={location_ || "Not stated"}
            />
          </ul>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 px-4 sm:px-3">
        {/* Actions */}
        <div className="flex flex-col gap-3 rounded-card border border-line bg-panel p-4 shadow-panel">
          {isOwnProfile ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-pill border border-line bg-sand-wash text-lg font-semibold text-muted"
                >
                  {heroPhoto ? (
                    <img
                      src={heroPhoto}
                      alt=""
                      className="size-full object-cover"
                    />
                  ) : (
                    initialsOf(profile.display_name)
                  )}
                </span>
                <div className="flex min-w-0 flex-col gap-1">
                  <h2 className="text-sm font-semibold">This is your profile</h2>
                  <p className="text-xs leading-relaxed text-muted">
                    {myProfile?.is_discoverable === false
                      ? "Hidden from Find roommate right now. Turn visibility back on when you edit."
                      : "Students browsing Find roommate see this card and photo."}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  icon={<Camera className="size-4" />}
                  loading={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                >
                  {heroPhoto ? "Change photo" : "Add photo"}
                </Button>
                {heroPhoto && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={photoBusy}
                    onClick={() => void handleRemovePhoto()}
                  >
                    Remove photo
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Pencil className="size-4" />}
                  onClick={() => setEditOpen(true)}
                >
                  Edit profile
                </Button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Profile photo"
                  onChange={(event) => void handlePhoto(event.target.files?.[0])}
                />
              </div>

              <p className="text-[11px] text-subtle">
                JPEG, PNG or WebP · up to 5 MB. This is the same photo as your
                account, settings, roommate card and chats.
              </p>
              {photoError && <InlineAlert>{photoError}</InlineAlert>}
            </div>
          ) : blockedByMe ? (
            <div className="flex flex-col gap-3">
              <InlineAlert>
                You blocked {firstName}. Their profile and messages are hidden, and
                neither of you can send new interest or messages.
              </InlineAlert>
              {safetyError && <InlineAlert>{safetyError}</InlineAlert>}
              <Button
                variant="secondary"
                size="sm"
                className="w-fit"
                loading={unblocking}
                onClick={() => void handleUnblock()}
                icon={<Undo2 className="size-4" />}
              >
                Unblock {firstName}
              </Button>
            </div>
          ) : (
            <>
              {interestActive && (
                <InlineAlert tone="positive">
                  {interest?.status === "accepted"
                    ? `You and ${firstName} are connected. Agree the details in chat.`
                    : "Interest sent. This roommate can see that you would like to share."}
                </InlineAlert>
              )}
              {interestError && <InlineAlert>{interestError}</InlineAlert>}

              <div className="flex items-center gap-2">
                <Button
                  className="flex-1"
                  onClick={() => void handleSendInterest()}
                  loading={interestPending}
                  disabled={interestActive}
                  icon={<Send className="size-4" />}
                >
                  {interestActive ? "Interest sent" : "Send interest"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleOpenChat}
                  icon={<MessageCircle className="size-4" />}
                >
                  Chat
                </Button>
              </div>
            </>
          )}

          {!isOwnProfile && !blockedByMe && canCancelInterest &&
            (cancelInterestOpen ? (
              <div className="flex flex-col gap-2 rounded-tile border border-line bg-panel-raised p-3">
                <p className="text-xs leading-relaxed text-foreground">
                  Cancel your interest in {firstName}? Their profile owner will no
                  longer see your request. You can send it again later.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setCancelInterestOpen(false)}
                    disabled={cancellingInterest}
                  >
                    Keep interest
                  </Button>
                  <Button
                    size="sm"
                    variant="soft"
                    onClick={() => void handleCancelInterest()}
                    loading={cancellingInterest}
                    icon={<X className="size-4" />}
                  >
                    Yes, cancel interest
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="w-fit"
                onClick={() => {
                  setInterestError(null);
                  setCancelInterestOpen(true);
                }}
                icon={<X className="size-4" />}
              >
                Cancel interest
              </Button>
            ))}
          {!isOwnProfile && !blockedByMe && !signedIn && (
            <p className="text-[11px] text-subtle">
              You will be asked to sign in before sending interest or chatting.
            </p>
          )}
        </div>

        {profile.bio && (
          <Section id="about-roommate-heading" title="About">
            <p className="text-sm leading-relaxed whitespace-pre-line text-muted">
              {profile.bio}
            </p>
          </Section>
        )}

        <Section id="compatibility-heading" title="Compatibility">
          {compatibility != null && verdict ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-16 shrink-0 place-items-center rounded-full border border-accent/25 bg-accent/10 text-lg font-semibold text-accent-soft"
                >
                  {compatibility}%
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <Badge tone={verdict.tone}>{verdict.label}</Badge>
                  <p className="text-xs leading-relaxed text-muted">
                    Based on {breakdown.length} habits you have both verified.
                  </p>
                </div>
              </div>

              <ul className="flex flex-col gap-2">
                {breakdown.map((row) => (
                  <li
                    key={row.key}
                    className="flex flex-col gap-1.5 rounded-tile border border-line bg-panel-raised px-3 py-2"
                  >
                    <span className="text-[10px] font-medium tracking-[0.14em] text-subtle uppercase">
                      {row.label}
                    </span>
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-foreground">
                        <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                        You: {row.mineLabel}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-muted">
                        <span aria-hidden="true" className="size-2 rounded-full border border-line-strong" />
                        {firstName}: {row.theirsLabel}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-subtle">
                <Sparkles className="mt-0.5 size-3 shrink-0 text-accent-soft" aria-hidden="true" />
                Fit compares verified habits only. Read the profile and chat before
                deciding — it is a starting point, not a verdict.
              </p>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted">
              {standing === "verified"
                ? `${firstName} has not shared verified habits yet, so there is no fit score. Read the profile and chat before deciding.`
                : "Complete your verification to see how your habits compare with this roommate."}
            </p>
          )}
        </Section>

        <Section id="living-heading" title="What they are looking for">
          <ul className="flex flex-col gap-2 text-xs text-muted">
            <li className="flex items-start gap-2">
              <span
                aria-hidden="true"
                className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
              >
                <BadgeCheck className="size-3" />
              </span>
              <span>
                A shared place
                {location_ ? ` around ${location_}` : ""}
                {budget ? ` at about ${budget} per year` : ""}.
              </span>
            </li>
            {moveIn && (
              <li className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
                >
                  <BadgeCheck className="size-3" />
                </span>
                <span>Ready to move in from {moveIn}.</span>
              </li>
            )}
            {profile.institution && (
              <li className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-pill bg-accent/12 text-accent-soft"
                >
                  <BadgeCheck className="size-3" />
                </span>
                <span>Studying at {profile.institution}.</span>
              </li>
            )}
          </ul>
        </Section>

        {!isOwnProfile && (
        <Section id="safety-heading" title="Safety">
          <p className="text-xs leading-relaxed text-muted">
            Blocking is private: {firstName} is not told. Reports go only to
            QUARTERS moderators, who can review the account without revealing who
            reported it.
          </p>
          <div className="flex flex-wrap gap-2">
            {blockedByMe ? (
              <Button
                variant="secondary"
                size="sm"
                loading={unblocking}
                onClick={() => void handleUnblock()}
                icon={<Undo2 className="size-4" />}
              >
                Unblock {firstName}
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openSafety("block")}
                icon={<ShieldOff className="size-4" />}
              >
                Block
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openSafety("report")}
              icon={<Flag className="size-4" />}
            >
              Report
            </Button>
          </div>
          {safetyError && <InlineAlert>{safetyError}</InlineAlert>}
        </Section>
        )}

        <p className="text-[11px] leading-relaxed text-subtle">
          {isOwnProfile
            ? "You can edit, hide or remove your photo at any time from this screen."
            : "This is a seeded demo profile while roommate profile creation is being built. Interest and messages are saved in Supabase against your account."}
        </p>
      </div>

      {editOpen && (
        <EditRoommateProfileSheet
          open
          onClose={() => setEditOpen(false)}
          onSaved={() => onProfileChanged?.()}
        />
      )}

      <BottomSheet
        open={chatOpen}
        /* The message sheet can sit on top, so Escape closes only that one. */
        onClose={() => {
          if (!actionsFor) closeChat();
        }}
        size="tall"
        title={`Chat with ${profile.display_name}`}
        action={
          <>
            <IconButton
              label="Search this conversation"
              variant="outline"
              aria-pressed={searchOpen}
              onClick={() => {
                setSearchOpen((current) => !current);
                setQuery("");
              }}
            >
              <Search className="size-4" />
            </IconButton>
          <div className="relative">
            <IconButton
              label="Chat options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <MoreVertical className="size-4" />
            </IconButton>
            {menuOpen && (
              <div
                role="menu"
                aria-label="Chat options"
                className="absolute top-full right-0 z-20 mt-1 flex w-60 flex-col gap-0.5 rounded-tile border border-line bg-panel p-1 shadow-float"
              >
                {canCancelInterest && (
                  <button
                    type="button"
                    role="menuitem"
                    className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-panel-raised"
                    onClick={() => {
                      setMenuOpen(false);
                      setChatOpen(false);
                      setInterestError(null);
                      setCancelInterestOpen(true);
                    }}
                  >
                    <X className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                    Cancel your interest
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-panel-raised"
                  onClick={() => {
                    setMenuOpen(false);
                    setChatOpen(false);
                    openSafety("report");
                  }}
                >
                  <Flag className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  Report {firstName}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10"
                  onClick={() => {
                    setMenuOpen(false);
                    setChatOpen(false);
                    openSafety("block");
                  }}
                >
                  <ShieldAlert
                    className="size-3.5 shrink-0 text-danger"
                    aria-hidden="true"
                  />
                  Block {firstName}
                </button>
                <button
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={showMessageTimes}
                  className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-panel-raised"
                  onClick={toggleMessageTimes}
                >
                  <Clock3 className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  <span className="min-w-0 flex-1">Show message times</span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "rounded-pill px-1.5 py-0.5 text-[10px] tracking-wide uppercase",
                      showMessageTimes
                        ? "bg-accent/15 text-accent-soft"
                        : "bg-panel-raised text-subtle",
                    )}
                  >
                    {showMessageTimes ? "On" : "Off"}
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="flex items-center gap-2 rounded-[0.65rem] px-2.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-panel-raised"
                  onClick={() => void handleCopyProfileLink()}
                >
                  <Copy className="size-3.5 shrink-0 text-subtle" aria-hidden="true" />
                  Copy profile link
                </button>
                {menuNote && (
                  <p
                    role="status"
                    className="px-2.5 pb-1 text-[11px] leading-relaxed break-all text-subtle"
                  >
                    {menuNote}
                  </p>
                )}
              </div>
            )}
          </div>
          </>
        }
        footer={
          <ChatComposer
            inputId="roommate-message"
            placeholder="Say hello and share what you are looking for…"
            maxLength={MESSAGE_MAX_LENGTH}
            sending={sending}
            mediaKind="roommate"
            conversationId={`${profile.id}/${user?.id ?? "anonymous"}`}
            onSend={handleSendMessage}
            onTyping={typing.notifyTyping}
            onTypingStop={typing.stopTyping}
          />
        }
      >
        <div className="flex min-h-40 flex-col gap-3">
          {searchOpen && (
            <MessageSearchBar
              query={query}
              onQueryChange={setQuery}
              matches={visibleMessages.length}
              total={messages.length}
              onClose={() => {
                setSearchOpen(false);
                setQuery("");
              }}
              label="Search roommate messages"
            />
          )}

          {messagesLoading && messages.length === 0 && (
            <>
              <span role="status" className="sr-only">
                Loading messages
              </span>
              <ChatThreadSkeleton />
            </>
          )}
          {messagesError && <InlineAlert>{messagesError}</InlineAlert>}

          {searchOpen && query.trim() && visibleMessages.length === 0 && (
            <p className="text-sm leading-relaxed text-muted">
              No messages match “{query.trim()}”.
            </p>
          )}

          {!messagesLoading && messages.length === 0 && !messagesError && (
            <p className="text-sm leading-relaxed text-muted">
              No messages yet. Introduce yourself, mention your budget and when
              you want to move in.
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {visibleMessages.map((message) => {
              const mine = message.sender_id === user?.id;
              const sharedListing = message.shared_listing_id
                ? sharedListings.get(message.shared_listing_id)
                : undefined;
              // Rooms from a shared shortlist that are still published, in the
              // order they were sent; anything unpublished is counted instead.
              const shortlistIds = message.shared_listing_ids ?? [];
              const shortlist = shortlistIds.flatMap((listingId) => {
                const listing = sharedListings.get(listingId);
                return listing ? [listing] : [];
              });
              return (
                <li
                  key={message.id}
                  className={cn(
                    "max-w-[85%] rounded-tile border px-3 py-2 text-sm leading-relaxed",
                    mine
                      ? "self-end border-accent/30 bg-accent/12 text-foreground"
                      : "self-start border-line bg-panel-raised text-foreground",
                  )}
                >
                  {message.deleted_at ? (
                    <p className="text-[13px] italic leading-relaxed text-subtle">
                      This message was deleted
                    </p>
                  ) : (
                    <>
                      {message.image_path &&
                        imageUrls.get(message.image_path) && (
                          <img
                            src={imageUrls.get(message.image_path)}
                            alt="Shared photo"
                            loading="lazy"
                            className="mb-1.5 max-h-56 w-full rounded-[0.6rem] object-cover"
                          />
                        )}
                      {message.body !== "Sent a photo." && message.body}
                      {sharedListing && (
                        <SharedListingCard
                          listing={sharedListing}
                          canRequestGroupVisit={mine}
                          requested={Boolean(
                            groupVisitRequested[sharedListing.id],
                          )}
                          partySize={groupVisitRequested[sharedListing.id] ?? null}
                          onRequestGroupVisit={() =>
                            setGroupVisitListing(sharedListing)
                          }
                        />
                      )}
                      {shortlist.length > 0 && (
                        <SharedShortlistCard
                          listings={shortlist}
                          missing={shortlistIds.length - shortlist.length}
                        />
                      )}
                    </>
                  )}
                  {showMessageTimes && (
                    <time
                      dateTime={message.created_at}
                      className="mt-1 block text-[10px] text-subtle"
                    >
                      {messageTimeFormatter.format(new Date(message.created_at))}
                    </time>
                  )}
                  {mine && message.read_at && (
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] font-medium text-accent-soft">
                      <BadgeCheck className="size-3" aria-hidden="true" />
                      Seen
                    </span>
                  )}
                  <div className="mt-1 flex items-center justify-end gap-2">
                    {message.edited_at && !message.deleted_at && (
                      <span className="text-[10px] text-subtle">Edited</span>
                    )}
                    <MessageOptionsButton
                      label={`Message options${mine ? " for your message" : " for their message"}`}
                      onOpen={() => setActionsFor(message)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          {typingLabel(typing.typingIds.length) !== "" && (
            <p role="status" className="text-[11px] text-subtle">
              {typingLabel(typing.typingIds.length)}
            </p>
          )}

          <MessageActionsSheet
            open={Boolean(actionsFor)}
            onClose={() => setActionsFor(null)}
            kind="roommate"
            message={
              actionsFor
                ? {
                    id: actionsFor.id,
                    body: actionsFor.body,
                    mine: actionsFor.sender_id === viewerId,
                    deleted: Boolean(actionsFor.deleted_at),
                  }
                : null
            }
            onChanged={() => void reloadMessages({ silent: true })}
          />
        </div>
      </BottomSheet>

      <PlanGroupVisitSheet
        open={Boolean(groupVisitListing)}
        onClose={() => setGroupVisitListing(null)}
        listing={groupVisitListing}
        viewerId={viewerId}
        preferredRoommateProfileId={profile.id}
        onRequested={handleGroupVisitRequested}
      />

      <RoommateSafetySheet
        open={safetyMode !== null}
        mode={safetyMode ?? "block"}
        onClose={() => setSafetyMode(null)}
        profileId={profile.id}
        displayName={profile.display_name}
        viewerId={viewerId}
        onBlocked={handleBlocked}
      />
    </div>
  );
}
