import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRoommateMessagesChannel } from "@/roommates/use-roommate-messages-channel";

/**
 * A stand-in Supabase client that records the channel it was asked to open and
 * keeps the change handler so the test can play an incoming row change.
 */
const realtime = vi.hoisted(() => {
  const state = {
    channelNames: [] as string[],
    subscriptions: [] as unknown[][],
    handlers: [] as Array<() => void>,
    removed: [] as unknown[],
  };

  const channel = {
    on: (...args: unknown[]) => {
      state.subscriptions.push(args);
      state.handlers.push(args[2] as () => void);
      return channel;
    },
    subscribe: () => channel,
  };

  return {
    state,
    channel,
    client: {
      channel: (name: string) => {
        state.channelNames.push(name);
        return channel;
      },
      removeChannel: async (target: unknown) => {
        state.removed.push(target);
        return "ok";
      },
    },
  };
});

vi.mock("@/lib/supabase", () => ({ supabase: realtime.client }));

describe("useRoommateMessagesChannel", () => {
  beforeEach(() => {
    realtime.state.channelNames = [];
    realtime.state.subscriptions = [];
    realtime.state.handlers = [];
    realtime.state.removed = [];
  });

  it("listens to one chat thread while it is open and unsubscribes on close", () => {
    const onChange = vi.fn();
    const { unmount } = renderHook(() =>
      useRoommateMessagesChannel({
        profileId: "profile-1",
        enabled: true,
        onChange,
      }),
    );

    expect(realtime.state.channelNames).toEqual(["roommate-chat-profile-1"]);
    const [event, config, handler] = realtime.state.subscriptions[0] ?? [];
    expect(event).toBe("postgres_changes");
    expect(config).toEqual({
      event: "*",
      schema: "public",
      table: "roommate_messages",
      filter: "profile_id=eq.profile-1",
    });
    expect(typeof handler).toBe("function");

    unmount();
    expect(realtime.state.removed).toEqual([realtime.channel]);
  });

  it("opens no channel while the chat is closed", () => {
    renderHook(() =>
      useRoommateMessagesChannel({
        profileId: "profile-1",
        enabled: false,
        onChange: vi.fn(),
      }),
    );

    expect(realtime.state.channelNames).toEqual([]);
  });

  it("refreshes once for a burst of changes", async () => {
    const onChange = vi.fn();
    renderHook(() =>
      useRoommateMessagesChannel({
        profileId: "profile-1",
        enabled: true,
        onChange,
      }),
    );

    const handler = realtime.state.handlers[0];
    handler?.();
    handler?.();
    expect(onChange).not.toHaveBeenCalled();

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });
});
