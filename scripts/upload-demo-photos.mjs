#!/usr/bin/env bun
/**
 * Uploads the demo listings' photo catalogue into the private listing-images
 * bucket, so each seeded room has a gallery of photographs rather than a single
 * cover.
 *
 * Usage:
 *   bun scripts/upload-demo-photos.mjs
 *   bun scripts/upload-demo-photos.mjs --dry-run
 *
 * Requires VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Secrets are read
 * from the environment and never printed.
 *
 * The matching public.listing_images rows are seeded by
 * supabase/seed/mock-listings.sql; this script only creates the Storage objects
 * those rows point at (Storage objects cannot be created from SQL). Uploads use
 * upsert, so rerunning it is safe.
 */
import { createClient } from "@supabase/supabase-js";

const BUCKET = "listing-images";
const PROVIDER = "d0000000-0000-4000-8000-000000000002";

/**
 * Pexels photo ids per listing (free-to-use stock photographs of interiors).
 * Gallery positions are 1-based from 1; position 0 is the existing cover.
 */
const GALLERIES = {
  "d0000000-0000-4000-8000-000000000101": ["279607", "1457842", "1080721"],
  "d0000000-0000-4000-8000-000000000102": ["1866149", "2062426", "2062431"],
  "d0000000-0000-4000-8000-000000000103": ["259588", "259962", "1090638"],
  "d0000000-0000-4000-8000-000000000104": ["2029667", "1457845", "279607"],
  "d0000000-0000-4000-8000-000000000105": ["1457842", "1866149", "1080721"],
  "d0000000-0000-4000-8000-000000000106": ["2062426", "259588", "2029667"],
};

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !serviceKey) {
  console.error(
    "VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (Settings -> Environment).",
  );
  process.exit(2);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let uploaded = 0;

for (const [listingId, photoIds] of Object.entries(GALLERIES)) {
  for (const [offset, photoId] of photoIds.entries()) {
    const position = offset + 1;
    const path = `${PROVIDER}/${listingId}/gallery-${position}.jpg`;
    process.stdout.write(`${path} ... `);

    if (dryRun) {
      console.log("skipped (dry run)");
      continue;
    }

    const source = await fetch(
      `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=1200`,
    );
    if (!source.ok) {
      console.error(`source photo ${photoId} failed (${source.status})`);
      process.exit(1);
    }

    const bytes = new Uint8Array(await source.arrayBuffer());
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "image/jpeg", upsert: true });

    if (error) {
      console.error(`failed: ${error.message}`);
      process.exit(1);
    }

    uploaded += 1;
    console.log(`ok (${Math.round(bytes.byteLength / 1024)} KB)`);
  }
}

console.log(`${dryRun ? "would upload" : "uploaded"} ${uploaded} photo(s)`);
