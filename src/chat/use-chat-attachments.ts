import { useEffect, useState } from "react";
import { signChatImageUrls } from "@/chat/media";
import { supabase } from "@/lib/supabase";
import {
  loadListingsByIds,
  type PublicListing,
} from "@/listings/public-listings";

/** The attachment fields any chat message can carry. */
export type ChatAttachmentFields = {
  shared_listing_id: string | null;
  image_path: string | null;
};

/**
 * Resolves everything a thread's bubbles need beyond text: the public summary
 * behind each property card, and a signed URL for each photo in the private
 * chat-media bucket. Missing or unreadable attachments simply resolve to
 * nothing, so the message still renders as text.
 */
export function useChatAttachments(messages: ChatAttachmentFields[]): {
  listings: Map<string, PublicListing>;
  imageUrls: Map<string, string>;
} {
  const [listings, setListings] = useState<Map<string, PublicListing>>(
    new Map(),
  );
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    const listingIds = [
      ...new Set(
        messages
          .map((message) => message.shared_listing_id)
          .filter((listingId): listingId is string => Boolean(listingId)),
      ),
    ];
    const imagePaths = [
      ...new Set(
        messages
          .map((message) => message.image_path)
          .filter((path): path is string => Boolean(path)),
      ),
    ];
    if (listingIds.length === 0 && imagePaths.length === 0) return;

    let active = true;

    if (listingIds.length > 0) {
      void loadListingsByIds(client, listingIds).then((resolved) => {
        if (active) setListings(resolved);
      });
    }
    if (imagePaths.length > 0) {
      void signChatImageUrls(client, imagePaths).then((resolved) => {
        if (active) setImageUrls(resolved);
      });
    }

    return () => {
      active = false;
    };
  }, [messages]);

  return { listings, imageUrls };
}
