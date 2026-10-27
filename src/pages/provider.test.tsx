import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { PostgrestError } from "@supabase/supabase-js";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProviderPage from "@/pages/provider";
import type { ProviderStatus } from "@/provider/application";

const mocks = vi.hoisted(() => {
  const rpcMaybeSingle = vi.fn();
  const rpc = vi.fn();
  const insertSingle = vi.fn();
  const insertSelect = vi.fn();
  const insert = vi.fn();
  const reviewMaybeSingle = vi.fn();
  const reviewLimit = vi.fn();
  const reviewOrder = vi.fn();
  const reviewEq = vi.fn();
  const reviewSelect = vi.fn();
  const from = vi.fn();
  const client = { rpc, from };

  return {
    client,
    from,
    rpc,
    rpcMaybeSingle,
    insert,
    insertSelect,
    insertSingle,
    reviewSelect,
    reviewEq,
    reviewOrder,
    reviewLimit,
    reviewMaybeSingle,
  };
});

vi.mock("@/auth/use-auth", () => ({
  useAuth: () => ({
    status: "signedIn",
    user: { id: "user-1", email: "student@example.com" },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: mocks.client,
}));

// This suite covers the application and review flow; the provider inbox has its
// own data layer, so its RPC is stubbed to an empty inbox here.
vi.mock("@/listings/listing-messages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/listings/listing-messages")>();
  return {
    ...actual,
    loadListingChatThreads: async () => ({ threads: [], error: null }),
  };
});

function pgError(code: string): PostgrestError {
  return {
    code,
    message: "database error",
    details: "",
    hint: "",
  } as unknown as PostgrestError;
}

const timestamps = {
  created_at: "2026-10-24T09:00:00.000Z",
  updated_at: "2026-10-24T09:00:00.000Z",
};

const applicationRow = {
  id: "provider-1",
  kind: "landlord",
  display_name: "Ada Rooms",
  status: "pending",
  ...timestamps,
};

function applicationWithStatus(status: ProviderStatus) {
  return { ...applicationRow, status };
}

function prepareClient() {
  mocks.rpc.mockImplementation(() => ({ maybeSingle: mocks.rpcMaybeSingle }));
  mocks.insert.mockImplementation(() => ({ select: mocks.insertSelect }));
  mocks.insertSelect.mockImplementation(() => ({ single: mocks.insertSingle }));
  mocks.from.mockImplementation((table: string) =>
    table === "providers"
      ? { insert: mocks.insert }
      : { select: mocks.reviewSelect },
  );
  mocks.reviewSelect.mockImplementation(() => ({ eq: mocks.reviewEq }));
  mocks.reviewEq.mockImplementation(() => ({ order: mocks.reviewOrder }));
  mocks.reviewOrder.mockImplementation(() => ({ limit: mocks.reviewLimit }));
  mocks.reviewLimit.mockImplementation(() => ({
    maybeSingle: mocks.reviewMaybeSingle,
  }));

  mocks.rpcMaybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.insertSingle.mockResolvedValue({ data: null, error: null });
  mocks.reviewMaybeSingle.mockResolvedValue({ data: null, error: null });
}

function renderPage(entry = "/provider") {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ProviderPage />
    </MemoryRouter>,
  );
}

async function openForm() {
  const view = renderPage();
  await waitFor(() => {
    expect(
      screen.getByRole("heading", { name: "Apply to list on QUARTERS" }),
    ).toBeTruthy();
  });
  return view;
}

function fillForm(name = "Ada Rooms") {
  fireEvent.click(screen.getByRole("radio", { name: /Landlord/ }));
  fireEvent.change(screen.getByLabelText("Provider or business name"), {
    target: { value: name },
  });
}

beforeEach(prepareClient);

describe("Provider application form", () => {
  it("renders the form for an account with no application", async () => {
    await openForm();

    expect(
      screen.getByRole("heading", { level: 1, name: "List with QUARTERS" }),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Landlord/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Agent/ })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Submit application" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Only a QUARTERS administrator can approve one/),
    ).toBeTruthy();
  });

  it("preselects the application type from the provider route", async () => {
    renderPage("/provider?kind=agent");
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Apply to list on QUARTERS" }),
      ).toBeTruthy();
    });

    expect(
      (screen.getByRole("radio", { name: /Agent/ }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: /Landlord/ }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("ignores an unknown kind in the URL", async () => {
    renderPage("/provider?kind=owner");
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Apply to list on QUARTERS" }),
      ).toBeTruthy();
    });

    expect(
      (screen.getByRole("radio", { name: /Agent/ }) as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByRole("radio", { name: /Landlord/ }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("requires a provider type and a valid name before submitting", async () => {
    await openForm();

    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));

    expect(
      screen.getByText(
        "Choose whether you are applying as a landlord or an agent.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Enter your name or business name.")).toBeTruthy();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("submits a pending application and shows the status confirmation", async () => {
    mocks.insertSingle.mockResolvedValue({ data: applicationRow, error: null });
    await openForm();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your application is being reviewed." }),
      ).toBeTruthy();
    });

    expect(mocks.insert).toHaveBeenCalledWith({
      owner_id: "user-1",
      kind: "landlord",
      display_name: "Ada Rooms",
      status: "pending",
    });
    expect(screen.getByText("Pending review")).toBeTruthy();
    expect(
      screen.getByText("Application submitted. It is now pending review."),
    ).toBeTruthy();
    expect(screen.getByText("Ada Rooms")).toBeTruthy();
  });

  it("reloads the submitted application after a page remount", async () => {
    mocks.insertSingle.mockResolvedValue({ data: applicationRow, error: null });
    const firstRender = await openForm();
    fillForm();

    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your application is being reviewed." }),
      ).toBeTruthy();
    });

    firstRender.unmount();

    // A fresh mount represents a refresh: the page must recover the record
    // from the database function, not from component state.
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: applicationRow,
      error: null,
    });
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your application is being reviewed." }),
      ).toBeTruthy();
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Pending review")).toBeTruthy();
  });

  it("submits only once while a request is in flight", async () => {
    let resolveInsert:
      | ((value: { data: unknown; error: unknown }) => void)
      | undefined;
    const pendingInsert = new Promise<{ data: unknown; error: unknown }>(
      (resolve) => {
        resolveInsert = resolve;
      },
    );
    mocks.insertSingle.mockReturnValue(pendingInsert);

    await openForm();
    fillForm();

    const submitButton = screen.getByRole("button", {
      name: "Submit application",
    });
    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(mocks.insert).toHaveBeenCalledTimes(1);
    });
    expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    expect(submitButton.getAttribute("aria-busy")).toBe("true");

    fireEvent.click(submitButton);
    expect(mocks.insert).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveInsert?.({ data: applicationRow, error: null });
      await pendingInsert;
    });

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your application is being reviewed." }),
      ).toBeTruthy();
    });
  });

  it("explains a duplicate application and reveals the existing status", async () => {
    mocks.rpcMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: applicationRow, error: null });
    mocks.insertSingle.mockResolvedValue({
      data: null,
      error: pgError("23505"),
    });

    await openForm();
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Submit application" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Your application is being reviewed." }),
      ).toBeTruthy();
    });

    expect(
      screen.getByText(/You already have a provider application/),
    ).toBeTruthy();
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });
});

describe("Provider application status", () => {
  const cases: Array<[ProviderStatus, string, string]> = [
    ["pending", "Pending review", "Your application is being reviewed."],
    ["approved", "Approved", "You are approved to list on QUARTERS."],
    ["rejected", "Not approved", "Your application was not approved."],
    ["suspended", "Suspended", "Your provider account is suspended."],
  ];

  it.each(cases)("shows the %s status", async (status, badge, title) => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: applicationWithStatus(status),
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: title })).toBeTruthy();
    });
    expect(screen.getByText(badge)).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "Apply to list on QUARTERS" }),
    ).toBeNull();
  });

  it("shows the provider-facing review note for a rejected application", async () => {
    mocks.rpcMaybeSingle.mockResolvedValue({
      data: applicationWithStatus("rejected"),
      error: null,
    });
    mocks.reviewMaybeSingle.mockResolvedValue({
      data: {
        id: 9,
        decision: "rejected",
        provider_note: "Please add ownership evidence.",
        reviewed_at: "2026-10-24T11:00:00.000Z",
      },
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Latest review")).toBeTruthy();
    });
    expect(screen.getByText("Please add ownership evidence.")).toBeTruthy();
  });

  it("names the lookup migration when status cannot be read, then retries", async () => {
    mocks.rpcMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: pgError("PGRST202"),
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Provider status unavailable" }),
      ).toBeTruthy();
    });
    expect(
      screen.getByText(/20261024090000_add_current_provider_application/),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Apply to list on QUARTERS" }),
      ).toBeTruthy();
    });
  });
});
