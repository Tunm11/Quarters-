/**
 * Device-scoped preferences.
 *
 * These are UI choices this build can honour locally: motion reduction applies
 * immediately, and notification choices are stored for this browser. They are
 * not account settings and never pretend to sync across devices. The one
 * saved-room choice the database has to read lives on the profile instead; see
 * `src/settings/saved-room-alerts.ts`.
 */

export type DevicePreferences = {
  /** Turns off animation and smooth scrolling even when the device allows it. */
  reduceMotion: boolean;
  /** Wants to hear about newly published rooms. */
  notifyNewListings: boolean;
  /** Wants a weekly email digest. Delivery is not wired yet. */
  notifyEmailDigest: boolean;
};

export const DEVICE_PREFERENCES_KEY = "quarters.device-preferences.v1";

export const defaultDevicePreferences: DevicePreferences = {
  reduceMotion: false,
  notifyNewListings: true,
  notifyEmailDigest: false,
};

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/** Reads stored preferences, ignoring unknown keys and malformed values. */
export function parseDevicePreferences(raw: string | null): DevicePreferences {
  if (!raw) return { ...defaultDevicePreferences };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ...defaultDevicePreferences };
    }

    const record = parsed as Record<string, unknown>;
    return {
      reduceMotion: isBoolean(record.reduceMotion)
        ? record.reduceMotion
        : defaultDevicePreferences.reduceMotion,
      notifyNewListings: isBoolean(record.notifyNewListings)
        ? record.notifyNewListings
        : defaultDevicePreferences.notifyNewListings,
      notifyEmailDigest: isBoolean(record.notifyEmailDigest)
        ? record.notifyEmailDigest
        : defaultDevicePreferences.notifyEmailDigest,
    };
  } catch {
    return { ...defaultDevicePreferences };
  }
}

export function loadDevicePreferences(storage: Storage | null = getLocalStorage()): DevicePreferences {
  if (!storage) return { ...defaultDevicePreferences };
  try {
    return parseDevicePreferences(storage.getItem(DEVICE_PREFERENCES_KEY));
  } catch {
    return { ...defaultDevicePreferences };
  }
}

export function saveDevicePreferences(
  preferences: DevicePreferences,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(DEVICE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Storage can be unavailable (private mode, quota). Preferences remain
    // valid for this session; nothing else should break.
  }
}

/**
 * Applies the motion preference to the document. Setting the attribute is
 * enough: index.css turns off animation/transition for it. When motion is
 * allowed the attribute is removed so the device's own setting wins again.
 */
export function applyReduceMotionPreference(reduceMotion: boolean): void {
  if (typeof document === "undefined") return;
  if (reduceMotion) {
    document.documentElement.dataset.reduceMotion = "true";
  } else {
    delete document.documentElement.dataset.reduceMotion;
  }
}
