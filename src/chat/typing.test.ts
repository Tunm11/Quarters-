import { describe, expect, it } from "vitest";
import { typingLabel } from "@/chat/typing";

describe("typingLabel", () => {
  it("says nothing when the thread is quiet", () => {
    expect(typingLabel(0)).toBe("");
  });

  it("keeps one person anonymous", () => {
    expect(typingLabel(1)).toBe("Someone is typing…");
  });

  it("counts the crowd", () => {
    expect(typingLabel(3)).toBe("3 people are typing…");
  });
});
