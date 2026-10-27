import type { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  filterRoommateProfiles,
  formatMoveIn,
  formatRoommateBudget,
  formatRoommateBudgetShort,
  formatRoommateLocation,
  initialsOf,
  mapRoommateProfilesError,
  roommateCardGradient,
  roommateCardGradients,
  type RoommateProfile,
} from "@/roommates/roommate-profiles";

function pgError(code: string): PostgrestError {
  return {
    code,
    message: "database error",
    details: "",
    hint: "",
  } as unknown as PostgrestError;
}

const profiles: RoommateProfile[] = [
  {
    id: "r-1",
    display_name: "Amara O.",
    headline: "300 level Law · quiet",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Akoka",
    budget_amount: 450000,
    currency: "NGN",
    gender: "female",
    move_in_date: "2026-11-15",
    bio: "Studies most evenings and keeps shared spaces clean.",
    avatar_url: null,
    traits: null,
  },
  {
    id: "r-2",
    display_name: "Tunde A.",
    headline: "Computer Science · night owl",
    institution: "University of Lagos",
    city: "Lagos",
    neighbourhood: "Yaba",
    budget_amount: 600000,
    currency: "NGN",
    gender: "male",
    move_in_date: "2026-11-01",
    bio: "Moving from Ibadan for an internship.",
    avatar_url: null,
    traits: null,
  },
  {
    id: "r-3",
    display_name: "Ifeoma N.",
    headline: "Medicine · needs a quiet room",
    institution: "Lagos State University",
    city: "Lagos",
    neighbourhood: "Ikeja",
    budget_amount: 900000,
    currency: "NGN",
    gender: null,
    move_in_date: null,
    bio: null,
    avatar_url: null,
    traits: null,
  },
];

describe("filterRoommateProfiles", () => {
  it("returns everyone when there is no query and no budget filter", () => {
    expect(
      filterRoommateProfiles(profiles, { query: "", budget: "all" }),
    ).toHaveLength(3);
  });

  it("searches name, headline, area, campus and bio", () => {
    for (const query of ["amara", "yaba", "lagos state", "ibadan"]) {
      expect(
        filterRoommateProfiles(profiles, { query, budget: "all" }),
      ).toHaveLength(1);
    }

    expect(
      filterRoommateProfiles(profiles, { query: "quiet", budget: "all" }).map(
        (profile) => profile.display_name,
      ),
    ).toEqual(["Amara O.", "Ifeoma N."]);
  });

  it("filters by stated gender and leaves out profiles with none", () => {
    expect(
      filterRoommateProfiles(profiles, {
        query: "",
        budget: "all",
        gender: "female",
      }).map((profile) => profile.display_name),
    ).toEqual(["Amara O."]);

    expect(
      filterRoommateProfiles(profiles, {
        query: "",
        budget: "all",
        gender: "male",
      }).map((profile) => profile.display_name),
    ).toEqual(["Tunde A."]);

    // "Any gender" still shows everyone, including the unstated one.
    expect(
      filterRoommateProfiles(profiles, { query: "", budget: "all", gender: "all" }),
    ).toHaveLength(3);
  });

  it("isolates the matching profile for a specific area", () => {
    expect(
      filterRoommateProfiles(profiles, { query: "Yaba", budget: "all" }).map(
        (profile) => profile.display_name,
      ),
    ).toEqual(["Tunde A."]);
  });

  it("filters by budget band", () => {
    const under = filterRoommateProfiles(profiles, {
      query: "",
      budget: "under-500",
    });
    expect(under.map((profile) => profile.display_name)).toEqual(["Amara O."]);

    const middle = filterRoommateProfiles(profiles, {
      query: "",
      budget: "500-700",
    });
    expect(middle.map((profile) => profile.display_name)).toEqual(["Tunde A."]);

    const over = filterRoommateProfiles(profiles, {
      query: "",
      budget: "over-700",
    });
    expect(over.map((profile) => profile.display_name)).toEqual(["Ifeoma N."]);
  });

  it("excludes profiles with no stated budget from a budget band", () => {
    const noBudget = [{ ...profiles[0], budget_amount: null }];
    expect(
      filterRoommateProfiles(noBudget, { query: "", budget: "under-500" }),
    ).toHaveLength(0);
  });

  it("combines search and budget filters", () => {
    expect(
      filterRoommateProfiles(profiles, { query: "lagos", budget: "over-700" }),
    ).toHaveLength(1);
    expect(
      filterRoommateProfiles(profiles, { query: "Yaba", budget: "over-700" }),
    ).toHaveLength(0);
  });
});

describe("formatting", () => {
  it("formats full and compact budgets", () => {
    expect(formatRoommateBudget(540000)).toContain("540,000");
    expect(formatRoommateBudgetShort(540000)).toBe("₦540k");
    expect(formatRoommateBudgetShort(600000)).toBe("₦600k");
  });

  it("formats location and move-in dates", () => {
    expect(formatRoommateLocation(profiles[0])).toBe("Akoka, Lagos");
    expect(formatMoveIn("2026-11-15")).toBe("15 Nov");
    expect(formatMoveIn(null)).toBeNull();
    expect(formatMoveIn("not-a-date")).toBeNull();
  });

  it("builds initials from the display name", () => {
    expect(initialsOf("Amara O.")).toBe("AO");
    expect(initialsOf("Tunde")).toBe("T");
    expect(initialsOf("   ")).toBe("?");
  });

  it("picks a stable card gradient per profile id", () => {
    expect(roommateCardGradient("r-1")).toBe(roommateCardGradient("r-1"));
    expect(roommateCardGradients).toContain(roommateCardGradient("r-2"));
  });
});

describe("mapRoommateProfilesError", () => {
  it("explains an unapplied migration", () => {
    expect(mapRoommateProfilesError(pgError("42P01"))).toContain(
      "roommate migration",
    );
    expect(mapRoommateProfilesError(pgError("PGRST205"))).toContain(
      "roommate migration",
    );
  });

  it("falls back to a retryable message", () => {
    expect(mapRoommateProfilesError(pgError("XX000"))).toBe(
      "Could not load roommate profiles. Please try again.",
    );
  });
});
