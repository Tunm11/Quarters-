import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MessageActionsSheet } from "@/components/chat/message-actions-sheet";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

function renderSheet({
  mine = true,
  deleted = false,
  body = "Original text",
}: {
  mine?: boolean;
  deleted?: boolean;
  body?: string;
} = {}) {
  const onChanged = vi.fn();
  const onClose = vi.fn();

  render(
    <MessageActionsSheet
      open
      onClose={onClose}
      kind="group"
      message={{ id: "message-1", body, mine, deleted }}
      onChanged={onChanged}
    />,
  );

  return { onChanged, onClose };
}

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ error: null });
});

describe("MessageActionsSheet", () => {
  it("offers edit, hide and withdraw on your own message", () => {
    renderSheet();

    expect(screen.getByRole("button", { name: /Edit message/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Delete for me/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Delete for everyone/ }),
    ).toBeTruthy();
  });

  it("only offers hiding someone else's message", () => {
    renderSheet({ mine: false });

    expect(screen.queryByRole("button", { name: /Edit message/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Delete for everyone/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Delete for me/ })).toBeTruthy();
  });

  it("saves an edit through the RPC and refreshes the thread", async () => {
    const { onChanged, onClose } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Edit message/ }));
    const field = screen.getByLabelText("Edit message");
    fireEvent.change(field, { target: { value: "  Corrected text  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("edit_chat_message", {
        p_kind: "group",
        p_message_id: "message-1",
        p_body: "Corrected text",
      });
    });
    expect(onChanged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the edit disabled until the text changes", () => {
    renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Edit message/ }));

    const save = screen.getByRole("button", { name: "Save changes" });
    expect(save.hasAttribute("disabled")).toBe(true);
  });

  it("confirms before deleting for everyone", async () => {
    const { onChanged } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Delete for everyone/ }));
    expect(rpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^Delete for everyone$/ }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("delete_chat_message_for_everyone", {
        p_kind: "group",
        p_message_id: "message-1",
      });
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it("hides a message for this viewer only", async () => {
    renderSheet({ mine: false });

    fireEvent.click(screen.getByRole("button", { name: /Delete for me/ }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("hide_chat_message", {
        p_kind: "group",
        p_message_id: "message-1",
      });
    });
  });

  it("surfaces a refused change instead of closing", async () => {
    rpc.mockResolvedValue({
      error: { code: "42501", message: "You can only edit your own messages." },
    });
    const { onClose } = renderSheet();

    fireEvent.click(screen.getByRole("button", { name: /Edit message/ }));
    fireEvent.change(screen.getByLabelText("Edit message"), {
      target: { value: "Trying again" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(
      await screen.findByText("You can only edit your own messages."),
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("offers only hiding once a message was withdrawn", () => {
    renderSheet({ deleted: true, body: "This message was deleted" });

    expect(screen.queryByRole("button", { name: /Edit message/ })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Delete for everyone/ }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: /Delete for me/ })).toBeTruthy();
  });
});
