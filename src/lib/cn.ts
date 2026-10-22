/**
 * Joins conditional class names. Intentionally tiny: no runtime dependency and
 * no Tailwind class merging, so keep conflicting utilities out of the same call.
 */
export type ClassValue = string | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(" ");
}
