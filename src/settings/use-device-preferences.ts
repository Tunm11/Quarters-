import { useCallback, useState } from "react";
import {
  applyReduceMotionPreference,
  defaultDevicePreferences,
  loadDevicePreferences,
  saveDevicePreferences,
  type DevicePreferences,
} from "@/settings/preferences";

/**
 * Reads and updates this device's preferences. Every update is saved and, for
 * motion, applied immediately so the switch has a visible effect.
 */
export function useDevicePreferences() {
  const [preferences, setPreferences] = useState<DevicePreferences>(() =>
    loadDevicePreferences(),
  );

  const update = useCallback((patch: Partial<DevicePreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      saveDevicePreferences(next);
      if (patch.reduceMotion !== undefined) {
        applyReduceMotionPreference(next.reduceMotion);
      }
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const defaults = { ...defaultDevicePreferences };
    setPreferences(defaults);
    saveDevicePreferences(defaults);
    applyReduceMotionPreference(defaults.reduceMotion);
  }, []);

  return { preferences, update, reset };
}
