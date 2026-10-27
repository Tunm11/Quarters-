import { afterEach, describe, expect, it } from "vitest";
import {
  applyReduceMotionPreference,
  defaultDevicePreferences,
  DEVICE_PREFERENCES_KEY,
  loadDevicePreferences,
  parseDevicePreferences,
  saveDevicePreferences,
} from "@/settings/preferences";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

afterEach(() => {
  delete document.documentElement.dataset.reduceMotion;
});

describe("device preferences", () => {
  it("falls back to defaults when nothing is stored", () => {
    const storage = new MemoryStorage();
    expect(loadDevicePreferences(storage)).toEqual(defaultDevicePreferences);
  });

  it("ignores malformed JSON and non-boolean values", () => {
    expect(parseDevicePreferences("{not json")).toEqual(defaultDevicePreferences);
    expect(parseDevicePreferences("[]")).toEqual(defaultDevicePreferences);
    expect(
      parseDevicePreferences(
        JSON.stringify({ reduceMotion: "yes", notifyNewListings: 3, notifyEmailDigest: true }),
      ),
    ).toEqual({ ...defaultDevicePreferences, notifyEmailDigest: true });
  });

  it("round-trips preferences through storage", () => {
    const storage = new MemoryStorage();
    const preferences = {
      ...defaultDevicePreferences,
      reduceMotion: true,
      notifyNewListings: false,
      notifyEmailDigest: true,
    };

    saveDevicePreferences(preferences, storage);

    expect(storage.getItem(DEVICE_PREFERENCES_KEY)).toContain("reduceMotion");
    expect(loadDevicePreferences(storage)).toEqual(preferences);
  });

  it("applies and removes the motion attribute", () => {
    applyReduceMotionPreference(true);
    expect(document.documentElement.dataset.reduceMotion).toBe("true");

    applyReduceMotionPreference(false);
    expect(document.documentElement.dataset.reduceMotion).toBeUndefined();
  });
});
