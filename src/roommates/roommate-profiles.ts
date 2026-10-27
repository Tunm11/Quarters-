import type { PostgrestError } from "@supabase/supabase-js";
import { ACCOUNT_AVATAR_BUCKET, isAbsoluteAvatarValue } from "@/auth/avatar";
import type { RoommateProfileRow } from "@/lib/database.types";
import { cachedSignedUrls } from "@/lib/signed-urls";
import type { TypedSupabaseClient } from "@/lib/supabase";
import { traitScoresFromProfile, type TraitScores } from "@/roommates/verification";

/**
 * Public roommate discovery read model.
 *
 * RLS limits these rows to discoverable profiles; the explicit filter keeps the
 * query readable. `user_id` is never read on the client.
 */
export type RoommateProfile = Pick<
  RoommateProfileRow,
  | "id"
  | "display_name"
  | "headline"
  | "institution"
  | "city"
  | "neighbourhood"
  | "budget_amount"
  | "currency"
  | "move_in_date"
  | "bio"
  | "gender"
> & {
  /**
   * Short-lived signed URL for the student's photo.
   *
   * A profile owned by an account shows that account's photo — the same one
   * `/account`, Settings and roommate chats show. Curated demo rows have no
   * account, so they keep their seeded roommate-avatars photo. Null when there
   * is no photo or signing failed; the card then falls back to its initials
   * artwork.
   */
  avatar_url: string | null;
  /**
   * Derived 1-5 compatibility traits, mirrored from the owner's private
   * verification. Null for a profile that has not verified yet.
   */
  traits: TraitScores | null;
};

export const ROOMMATE_COLUMNS =
  "id, display_name, headline, institution, city, neighbourhood, budget_amount, currency, move_in_date, bio, gender, avatar_path, tidy_score, sleep_score, social_score, guest_score, routine_score";

/**
 * Seeded demo photos only. A real student's photo lives in the `avatars` bucket
 * and is read from their account row; `roommate_profiles.avatar_path` is kept
 * for demo rows, which have no account behind them.
 */
export const ROOMMATE_AVATAR_BUCKET = "roommate-avatars";

/**
 * Annual budget bands students actually search with. Nigerian landlords let
 * rooms per year (or per academic session), so a roommate's contribution is an
 * annual figure, never a monthly one.
 */
export const ROOMMATE_BUDGET_LOW = 500_000;
export const ROOMMATE_BUDGET_HIGH = 700_000;

export type RoommateBudgetFilter =
  | "all"
  | "under-500"
  | "500-700"
  | "over-700";

/**
 * Discovery shows the gender a student published on their verification. Only
 * stated genders are filterable: "prefer not to say" is stored as NULL, so it
 * never shows up under a specific choice.
 */
export type RoommateGenderFilter = "all" | "female" | "male";

export const roommateGenderFilters: {
  id: RoommateGenderFilter;
  label: string;
}[] = [
  { id: "all", label: "Any gender" },
  { id: "female", label: "Female" },
  { id: "male", label: "Male" },
];

/** "Female", "Male", or null when the student did not state one. */
export function formatRoommateGender(
  profile: Pick<RoommateProfile, "gender">,
): string | null {
  if (profile.gender === "female") return "Female";
  if (profile.gender === "male") return "Male";
  return null;
}

export const roommateBudgetFilters: {
  id: RoommateBudgetFilter;
  label: string;
}[] = [
  { id: "all", label: "Any budget" },
  { id: "under-500", label: `Under ₦${ROOMMATE_BUDGET_LOW / 1000}k` },
  { id: "500-700", label: `₦${ROOMMATE_BUDGET_LOW / 1000}k–₦${ROOMMATE_BUDGET_HIGH / 1000}k` },
  { id: "over-700", label: `Above ₦${ROOMMATE_BUDGET_HIGH / 1000}k` },
];

const budgetFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  maximumFractionDigits: 0,
});

const moveInFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/** "₦45,000" */
export function formatRoommateBudget(amount: number): string {
  return budgetFormatter.format(amount);
}

/** "₦45k" — the compact pill used on the card. */
export function formatRoommateBudgetShort(amount: number): string {
  const rounded = Math.round(amount / 1000);
  return `₦${rounded}k`;
}

export function formatRoommateLocation(
  profile: Pick<RoommateProfile, "neighbourhood" | "city">,
): string {
  return [profile.neighbourhood, profile.city].filter(Boolean).join(", ");
}

export function formatMoveIn(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return moveInFormatter.format(date);
}

export function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/**
 * Warm card backgrounds, chosen deterministically from the profile id so a
 * profile keeps the same colour between renders and page loads. Deliberately no
 * stock photographs: these are demo profiles, and invented faces would imply
 * real people.
 */
export const roommateCardGradients = [
  "linear-gradient(160deg, #cfc3a4 0%, #7b7150 55%, #3f4227 100%)",
  "linear-gradient(160deg, #c3c8ad 0%, #6f7551 55%, #383d21 100%)",
  "linear-gradient(160deg, #dcccb4 0%, #96795a 55%, #453829 100%)",
  "linear-gradient(160deg, #b9bc9a 0%, #5b5d3b 55%, #2f3120 100%)",
];

export function roommateCardGradient(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash + id.charCodeAt(index)) % roommateCardGradients.length;
  }
  return roommateCardGradients[hash];
}

function matchesBudget(
  profile: Pick<RoommateProfile, "budget_amount">,
  budget: RoommateBudgetFilter,
): boolean {
  if (budget === "all") return true;
  const amount = profile.budget_amount;
  if (amount == null) return false;
  if (budget === "under-500") return amount < ROOMMATE_BUDGET_LOW;
  if (budget === "over-700") return amount > ROOMMATE_BUDGET_HIGH;
  return amount >= ROOMMATE_BUDGET_LOW && amount <= ROOMMATE_BUDGET_HIGH;
}

export function filterRoommateProfiles(
  profiles: RoommateProfile[],
  {
    query,
    budget,
    gender = "all",
  }: {
    query: string;
    budget: RoommateBudgetFilter;
    gender?: RoommateGenderFilter;
  },
): RoommateProfile[] {
  const normalizedQuery = query.trim().toLowerCase();

  return profiles.filter((profile) => {
    if (!matchesBudget(profile, budget)) return false;
    if (gender !== "all" && profile.gender !== gender) return false;
    if (!normalizedQuery) return true;

    const haystack = [
      profile.display_name,
      profile.headline,
      profile.institution,
      profile.city,
      profile.neighbourhood,
      profile.bio,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function mapRoommateProfilesError(error: PostgrestError): string {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Roommate profiles are not available yet. The roommate migration may not be applied to this Supabase project.";
  }
  return "Could not load roommate profiles. Please try again.";
}

/** Row shape returned by ROOMMATE_COLUMNS, before photos are signed. */
export type RoommateProfileRowData = Omit<RoommateProfile, "avatar_url" | "traits"> & {
  avatar_path: string | null;
  tidy_score: number | null;
  sleep_score: number | null;
  social_score: number | null;
  guest_score: number | null;
  routine_score: number | null;
};

export async function loadRoommateProfiles(
  client: TypedSupabaseClient,
): Promise<{ profiles: RoommateProfile[]; error: string | null }> {
  const { data, error } = await client
    .from("roommate_profiles")
    .select(ROOMMATE_COLUMNS)
    .eq("is_discoverable", true)
    .order("created_at", { ascending: true })
    .limit(24);

  if (error) {
    return { profiles: [], error: mapRoommateProfilesError(error) };
  }

  return { profiles: await withAvatarUrls(client, data ?? []), error: null };
}

type AccountPhoto = { owner_id: string | null; avatar_url: string | null };

/**
 * The account photo behind each roommate profile, in one round trip.
 *
 * `public.profiles` is own-row only, so another student's photo is not readable
 * directly; `roommate_account_photos` is the one narrow definer read that
 * answers it. It only covers discoverable profiles.
 *
 * Returns null when the function is not available yet (migration unapplied), so
 * the caller can fall back to the older roommate-avatars photo instead of
 * losing every card image.
 */
async function loadAccountPhotos(
  client: TypedSupabaseClient,
  profileIds: string[],
): Promise<Map<string, AccountPhoto> | null> {
  const { data, error } = await client.rpc("roommate_account_photos", {
    p_profile_ids: profileIds,
  });

  if (error) return null;

  return new Map(
    (data ?? []).map((row) => [
      row.profile_id,
      { owner_id: row.owner_id, avatar_url: row.avatar_url },
    ]),
  );
}

/**
 * Resolves one signed photo URL per profile, always from the owning account.
 *
 * A student has one photo: the account photo. Roommate cards, the roommate
 * profile screen and roommate chats therefore show what `/account` and Settings
 * show, and changing it in either place changes it everywhere.
 *
 * A profile with an account but no photo resolves to null (initials artwork)
 * rather than falling back to an older roommate photo, so the two screens can
 * never disagree. Curated demo rows (no account) keep their seeded
 * roommate-avatars photo.
 *
 * Photos live in private buckets, so reads go through Storage RLS and
 * short-lived signed URLs. Signing failures are non-fatal: the card simply
 * falls back to its initials artwork.
 */
export async function withAvatarUrls(
  client: TypedSupabaseClient,
  rows: RoommateProfileRowData[],
): Promise<RoommateProfile[]> {
  if (rows.length === 0) return [];

  const accountPhotos = await loadAccountPhotos(
    client,
    rows.map((row) => row.id),
  );

  // One photo per row plus the bucket it must be signed from.
  const photoByRow = new Map<string, { bucket: string; path: string }>();
  const absoluteByRow = new Map<string, string>();
  const pathsByBucket = new Map<string, string[]>();

  for (const row of rows) {
    const account = accountPhotos?.get(row.id);

    if (account?.owner_id) {
      // Owned by an account: that account's photo decides, including "none".
      if (!account.avatar_url) continue;
      if (isAbsoluteAvatarValue(account.avatar_url)) {
        absoluteByRow.set(row.id, account.avatar_url);
        continue;
      }
      photoByRow.set(row.id, {
        bucket: ACCOUNT_AVATAR_BUCKET,
        path: account.avatar_url,
      });
      continue;
    }

    // A curated demo row, a profile hidden from discovery, or an unapplied
    // migration: the seeded roommate photo is the only one available.
    if (!row.avatar_path) continue;
    photoByRow.set(row.id, {
      bucket: ROOMMATE_AVATAR_BUCKET,
      path: row.avatar_path,
    });
  }

  for (const photo of photoByRow.values()) {
    const paths = pathsByBucket.get(photo.bucket) ?? [];
    paths.push(photo.path);
    pathsByBucket.set(photo.bucket, paths);
  }

  // Signed URLs are cached per path, so a revisit reuses the photo the browser
  // already has instead of downloading it again.
  const signed = await Promise.all(
    [...pathsByBucket].map(async ([bucket, paths]) =>
      [bucket, await cachedSignedUrls(client, bucket, paths)] as const,
    ),
  );
  const urlByBucketAndPath = new Map<string, string>();
  for (const [bucket, urls] of signed) {
    for (const [path, url] of urls) {
      urlByBucketAndPath.set(`${bucket}:${path}`, url);
    }
  }

  return rows.map((row) => {
    const photo = photoByRow.get(row.id);
    const absolute = absoluteByRow.get(row.id);

    return {
      id: row.id,
      display_name: row.display_name,
      headline: row.headline,
      institution: row.institution,
      city: row.city,
      neighbourhood: row.neighbourhood,
      budget_amount: row.budget_amount,
      currency: row.currency,
      move_in_date: row.move_in_date,
      bio: row.bio,
      gender: row.gender,
      avatar_url: absolute ?? (photo
        ? (urlByBucketAndPath.get(`${photo.bucket}:${photo.path}`) ?? null)
        : null),
      traits: traitScoresFromProfile(row),
    };
  });
}
