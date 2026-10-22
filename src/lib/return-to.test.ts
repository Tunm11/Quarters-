import { describe, expect, it } from "vitest";
import { AUTH_FALLBACK_PATH, safeReturnTo } from "@/lib/return-to";

describe("safeReturnTo", () => {
  it("falls back when no value is given", () => {
    expect(safeReturnTo(null)).toBe(AUTH_FALLBACK_PATH);
    expect(safeReturnTo("")).toBe(AUTH_FALLBACK_PATH);
  });

  it("keeps an internal path", () => {
    expect(safeReturnTo("/account")).toBe("/account");
    expect(safeReturnTo("/explore?city=Lagos")).toBe("/explore?city=Lagos");
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(safeReturnTo("https://evil.example")).toBe(AUTH_FALLBACK_PATH);
    expect(safeReturnTo("//evil.example")).toBe(AUTH_FALLBACK_PATH);
    expect(safeReturnTo("/\\evil.example")).toBe(AUTH_FALLBACK_PATH);
  });

  it("never returns to the auth page itself", () => {
    expect(safeReturnTo("/auth")).toBe(AUTH_FALLBACK_PATH);
    expect(safeReturnTo("/auth?returnTo=/account")).toBe(AUTH_FALLBACK_PATH);
  });
});
