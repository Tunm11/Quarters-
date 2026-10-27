import { describe, expect, it } from "vitest";
import {
  draftFromProfile,
  validateMyProfile,
  type MyRoommateProfileDraft,
} from "@/roommates/my-profile";

function draft(overrides: Partial<MyRoommateProfileDraft> = {}): MyRoommateProfileDraft {
  return {
    displayName: "Akinpelu",
    headline: "Quiet, tidy, early riser",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Yaba",
    budget: "55000",
    moveInDate: "2026-11-15",
    bio: "I cook on weekends.",
    isDiscoverable: true,
    ...overrides,
  };
}

describe("roommate profile draft", () => {
  it("accepts a complete profile", () => {
    expect(validateMyProfile(draft())).toEqual({});
  });

  it("requires a display name and a city", () => {
    const errors = validateMyProfile(draft({ displayName: " ", city: "" }));
    expect(errors.displayName).toBeTruthy();
    expect(errors.city).toBeTruthy();
  });

  it("rejects a budget of zero or nonsense", () => {
    expect(validateMyProfile(draft({ budget: "0" })).budget).toBeTruthy();
    expect(validateMyProfile(draft({ budget: "" })).budget).toBeUndefined();
  });

  it("caps long optional fields", () => {
    const errors = validateMyProfile(draft({ bio: "x".repeat(601) }));
    expect(errors.bio).toContain("600");
  });

  it("maps an existing row into the draft", () => {
    const value = draftFromProfile({
      id: "p-1",
      display_name: "Amara O.",
      headline: null,
      institution: "University of Lagos",
      city: "Lagos",
      neighbourhood: "Akoka",
      budget_amount: 45000.5,
      move_in_date: null,
      bio: null,
      is_discoverable: false,
    });

    expect(value).toMatchObject({
      displayName: "Amara O.",
      headline: "",
      budget: "45001",
      moveInDate: "",
      isDiscoverable: false,
    });
  });
});
