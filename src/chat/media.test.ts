import { describe, expect, it, vi } from "vitest";
import {
  signChatImageUrls,
  uploadChatImage,
  validateChatImage,
} from "@/chat/media";
import type { TypedSupabaseClient } from "@/lib/supabase";

function imageFile(type = "image/png", bytes = 1024) {
  return new File([new Uint8Array(bytes)], "photo", { type });
}

describe("validateChatImage", () => {
  it("accepts the bucket's image types", () => {
    expect(validateChatImage(imageFile("image/jpeg"))).toBeNull();
    expect(validateChatImage(imageFile("image/webp"))).toBeNull();
  });

  it("rejects anything else, including oversize photos", () => {
    expect(validateChatImage(imageFile("image/gif"))).toMatch(/JPEG, PNG or WebP/);
    expect(
      validateChatImage(imageFile("image/png", 9 * 1024 * 1024)),
    ).toMatch(/larger than 8MB/);
  });
});

describe("uploadChatImage", () => {
  it("uploads into the conversation's folder with a safe extension", async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const client = {
      storage: { from: () => ({ upload }) },
    } as unknown as TypedSupabaseClient;

    const result = await uploadChatImage(client, {
      kind: "group",
      conversationId: "group-1",
      file: imageFile("image/png"),
    });

    expect(result.error).toBeNull();
    expect(result.path).toMatch(/^group\/group-1\/[a-z0-9-]+\.png$/);
    expect(upload).toHaveBeenCalledWith(
      result.path,
      expect.any(File),
      expect.objectContaining({ contentType: "image/png" }),
    );
  });

  it("does not upload a file it already rejected", async () => {
    const upload = vi.fn();
    const client = {
      storage: { from: () => ({ upload }) },
    } as unknown as TypedSupabaseClient;

    const result = await uploadChatImage(client, {
      kind: "room",
      conversationId: "listing-1",
      file: imageFile("text/plain"),
    });

    expect(result.path).toBeNull();
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports an upload failure without throwing", async () => {
    const client = {
      storage: {
        from: () => ({
          upload: vi.fn().mockResolvedValue({ error: { message: "nope" } }),
        }),
      },
    } as unknown as TypedSupabaseClient;

    const result = await uploadChatImage(client, {
      kind: "group",
      conversationId: "group-1",
      file: imageFile(),
    });

    expect(result.path).toBeNull();
    expect(result.error).toMatch(/Could not upload/);
  });
});

describe("signChatImageUrls", () => {
  it("returns a map of paths that resolved", async () => {
    const client = {
      storage: {
        from: () => ({
          createSignedUrls: vi.fn().mockResolvedValue({
            data: [
              { path: "group/g1/a.png", signedUrl: "https://signed/a" },
              { path: "group/g1/b.png", signedUrl: null },
            ],
          }),
        }),
      },
    } as unknown as TypedSupabaseClient;

    const urls = await signChatImageUrls(client, [
      "group/g1/a.png",
      "group/g1/b.png",
    ]);

    expect(urls.get("group/g1/a.png")).toBe("https://signed/a");
    expect(urls.has("group/g1/b.png")).toBe(false);
  });

  it("does not call storage without paths", async () => {
    const createSignedUrls = vi.fn();
    const client = {
      storage: { from: () => ({ createSignedUrls }) },
    } as unknown as TypedSupabaseClient;

    const urls = await signChatImageUrls(client, []);
    expect(urls.size).toBe(0);
    expect(createSignedUrls).not.toHaveBeenCalled();
  });
});
