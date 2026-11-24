import { supabase } from "./supabase";

export function catalogImageUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("catalog/")) return `/${path}`;
  return supabase?.storage.from("catalog-images").getPublicUrl(path).data.publicUrl ?? null;
}
