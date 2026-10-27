import {
  BellRing,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCheck,
  DoorClosed,
  DoorOpen,
  Flag,
  HeartHandshake,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  Tag,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "@/components/feedback/empty-state";
import { InlineAlert } from "@/components/feedback/inline-alert";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import {
  formatNotificationTime,
  notificationTone,
  type AppNotification,
  type NotificationKind,
} from "@/notifications/notifications";
import { useNotifications } from "@/notifications/use-notifications";
import { usePushNotifications } from "@/notifications/use-push-notifications";

const iconByKind: Record<NotificationKind, typeof BellRing> = {
  roommate_interest: UserPlus,
  roommate_accepted: HeartHandshake,
  roommate_declined: UserMinus,
  visit_requested: CalendarClock,
  visit_confirmed: CalendarCheck,
  visit_declined: CalendarX,
  room_requested: DoorOpen,
  room_approved: DoorOpen,
  room_declined: DoorClosed,
  saved_room_price_changed: Tag,
  saved_room_availability_changed: DoorClosed,
  saved_room_available: DoorOpen,
  saved_search_match: Search,
  roommate_blocked: ShieldOff,
  report_decision: Flag,
  appeal_decision: ShieldCheck,
};

const iconTone: Record<ReturnType<typeof notificationTone>, string> = {
  accent: "border-accent/35 bg-accent/12 text-accent-soft",
  positive: "border-positive/30 bg-positive/10 text-positive",
  caution: "border-caution/30 bg-caution/10 text-caution",
  neutral: "border-line bg-panel-raised text-muted",
};

/**
 * The activity feed behind the Bell: one row per thing that happened to this
 * account, newest first. Opening a row stamps it read; the unread dot and the
 * Bell badge come from the same `read_at` column.
 */
export default function NotificationsPage() {
  const {
    notifications,
    status,
    error,
    unreadCount,
    markingAll,
    reload,
    markRead,
    markAllRead,
  } = useNotifications();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pushDismissed, setPushDismissed] = useState(false);
  const push = usePushNotifications();

  async function handleMarkAll() {
    setActionError(null);
    const failure = await markAllRead();
    if (failure) setActionError(failure);
  }

  function handleOpen(notification: AppNotification) {
    if (notification.read_at !== null) return;
    void markRead(notification.id).then((failure) => {
      if (failure) setActionError(failure);
    });
  }

  const loading = status === "loading";
  const isEmpty = status === "ready" && notifications.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 pt-6 pb-4 sm:px-8 sm:pt-10">
      <SectionHeading
        id="notifications-heading"
        level={1}
        eyebrow="Activity"
        title="Notifications"
        description="Interests, visit answers, room decisions, changes to rooms you saved and safety updates, newest first. Opening one marks it read."
        action={
          unreadCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleMarkAll()}
              loading={markingAll}
              icon={<CheckCheck className="size-4" />}
            >
              Mark all read
            </Button>
          )
        }
      />

      {actionError && <InlineAlert>{actionError}</InlineAlert>}

      {push.state === "default" && !pushDismissed && (
        <Panel tone="raised" className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-pill border border-accent/30 bg-accent/10 text-accent-soft"
            >
              <BellRing className="size-4" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                Get these even when the app is closed
              </p>
              <p className="text-xs leading-relaxed text-muted">
                Turn on push for this browser. You can switch it off in Settings
                whenever you like.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => void push.enable()}
              loading={push.busy}
            >
              Turn on
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setPushDismissed(true)}
              disabled={push.busy}
            >
              Not now
            </Button>
          </div>
        </Panel>
      )}

      {push.error && <InlineAlert>{push.error}</InlineAlert>}

      {loading && (
        <ul className="flex list-none flex-col gap-2.5" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <li
              key={key}
              className="flex items-start gap-3 rounded-tile border border-line bg-panel p-3.5"
            >
              <Skeleton className="size-10 rounded-pill" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {status === "error" && (
        <div className="flex flex-col gap-3">
          <InlineAlert>{error}</InlineAlert>
          <Button
            variant="secondary"
            size="sm"
            className="w-fit"
            onClick={() => void reload()}
            icon={<RefreshCw className="size-4" />}
          >
            Try again
          </Button>
        </div>
      )}

      {isEmpty && (
        <EmptyState
          icon={BellRing}
          title="Nothing yet"
          description="When someone is interested in your roommate profile, answers a visit, decides on a room, a room you saved changes rent or availability, or a report or re-review you filed is decided, it lands here."
          note="Messages stay in the Messages tab and are not repeated here."
        />
      )}

      {status === "ready" && notifications.length > 0 && (
        <ul className="flex list-none flex-col gap-2.5">
          {notifications.map((notification) => {
            const Icon = iconByKind[notification.kind];
            const unread = notification.read_at === null;
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-pill border",
                    iconTone[notificationTone(notification.kind)],
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        "text-sm text-foreground",
                        unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {notification.title}
                    </span>
                    <span className="shrink-0 text-[10px] whitespace-nowrap text-subtle">
                      {formatNotificationTime(notification.created_at)}
                    </span>
                  </span>
                  {notification.body && (
                    <span className="text-[11px] leading-relaxed text-muted">
                      {notification.body}
                    </span>
                  )}
                </span>
                {unread && (
                  <span
                    aria-label="Unread"
                    className="mt-2 size-2 shrink-0 rounded-pill bg-accent"
                  />
                )}
              </>
            );

            const rowClasses = cn(
              "flex w-full items-start gap-3 rounded-tile border p-3.5 text-left transition-colors",
              unread
                ? "border-accent/30 bg-accent/[0.06] hover:border-accent/50"
                : "border-line bg-panel hover:border-line-strong",
            );

            return (
              <li key={notification.id}>
                {notification.href ? (
                  <Link
                    to={notification.href}
                    onClick={() => handleOpen(notification)}
                    className={rowClasses}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleOpen(notification)}
                    className={rowClasses}
                  >
                    {content}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
