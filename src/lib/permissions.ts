import type { Profile } from "./types";
export type Action =
  | "product"
  | "customer"
  | "draft"
  | "invoice"
  | "payment"
  | "settings"
  | "staff";
export function can(profile: Profile, action: Action, owner?: string) {
  if (!profile.active) return false;
  if (profile.role === "admin") return true;
  if (profile.role === "finance")
    return action === "payment" || action === "invoice";
  return (
    ["customer", "draft", "invoice"].includes(action) &&
    (owner === undefined || owner === profile.id)
  );
}
