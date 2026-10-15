import type { Profile } from "../types";
export const SLIDE_SECONDS = 10;
export const categories = [
  "Team wins",
  "Milestones",
  "Birthdays",
  "Anniversaries",
  "Community",
  "Just because",
];
export type Celebration = {
  id: string;
  store_id: string;
  submitted_by: string;
  caption: string;
  category: string;
  caption_style: import("./caption-style").CaptionStyle;
  original_path: string;
  slide_path: string;
  slide_bytes: number;
  status: "pending" | "approved" | "rejected" | "removed";
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  expires_at: string | null;
  imageUrl?: string;
  originalUrl?: string;
};
export function canUseCelebrations(
  profile: Pick<Profile, "active" | "role"> | null,
) {
  return (
    !!profile?.active &&
    ["manager", "supervisor", "admin"].includes(profile.role)
  );
}
export function canApprove(
  profile: Pick<Profile, "active" | "role" | "email"> | null,
) {
  return (
    !!profile?.active &&
    profile.role === "admin" &&
    profile.email.toLowerCase() === "daustin@powerspizza.com"
  );
}
export function isLive(
  item: Pick<Celebration, "status" | "expires_at">,
  now = Date.now(),
) {
  return (
    item.status === "approved" &&
    !!item.expires_at &&
    Date.parse(item.expires_at) > now
  );
}
export function loopSeconds(
  items: Pick<Celebration, "status" | "expires_at">[],
  now = Date.now(),
) {
  return items.filter((i) => isLive(i, now)).length * SLIDE_SECONDS;
}
export function feedUrl(projectUrl: string, token: string, format = "rss") {
  const u = new URL(projectUrl + "/functions/v1/celebration-feed");
  u.searchParams.set("token", token);
  if (format === "json") u.searchParams.set("format", "json");
  return u.toString();
}
