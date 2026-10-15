import { supabase } from "../lib/supabase";
import type { Celebration } from "./model";
import type { CaptionStyle } from "./caption-style";
import { renderSlide } from "./render";
function client() {
  if (!supabase) throw Error("The shared account system is not configured.");
  return supabase;
}
export async function loadCelebrations() {
  const db = client();
  const { data, error } = await db
    .from("celebrations")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return await Promise.all(
    (data as Celebration[]).map(async (item) => {
      const { data: image } = await db.storage
        .from("celebrations")
        .createSignedUrl(item.slide_path, 300);
      const { data: original } = await db.storage
        .from("celebrations")
        .createSignedUrl(item.original_path, 300);
      return {
        ...item,
        imageUrl: image?.signedUrl,
        originalUrl: original?.signedUrl,
      };
    }),
  );
}
export async function submitCelebration(
  userId: string,
  file: File,
  storeId: string,
  caption: string,
  category: string,
  style: CaptionStyle,
) {
  const db = client();
  const id = crypto.randomUUID(),
    root = `${userId}/${id}/`,
    originalPath = root + "original",
    slidePath = root + "slide.png";
  const slide = await renderSlide(file, caption, style);
  const uploaded: string[] = [];
  try {
    for (const [path, blob, type] of [
      [originalPath, file, file.type],
      [slidePath, slide, "image/png"],
    ] as const) {
      const { error } = await db.storage
        .from("celebrations")
        .upload(path, blob, { contentType: type, upsert: false });
      if (error) throw error;
      uploaded.push(path);
    }
    const { error } = await db
      .from("celebrations")
      .insert({
        id,
        store_id: storeId,
        submitted_by: userId,
        caption,
        category,
        caption_style: style,
        original_path: originalPath,
        slide_path: slidePath,
        slide_bytes: slide.size,
      });
    if (error) throw error;
  } catch (e) {
    if (uploaded.length) await db.storage.from("celebrations").remove(uploaded);
    throw e;
  }
}
export async function designCelebration(
  item: Celebration,
  caption: string,
  style: CaptionStyle,
) {
  const db = client();
  const { data: original, error: downloadError } = await db.storage
    .from("celebrations")
    .download(item.original_path);
  if (downloadError || !original)
    throw downloadError || Error("Photo unavailable.");
  const blob = await renderSlide(original, caption, style),
    path = `${item.submitted_by}/${item.id}/${crypto.randomUUID()}.png`;
  const { error: uploadError } = await db.storage
    .from("celebrations")
    .upload(path, blob, { contentType: "image/png", upsert: false });
  if (uploadError) throw uploadError;
  const { data, error } = await db
    .from("celebrations")
    .update({
      caption,
      caption_style: style,
      slide_path: path,
      slide_bytes: blob.size,
    })
    .eq("id", item.id)
    .eq("updated_at", item.updated_at)
    .select("id");
  if (error || !data?.length) {
    await db.storage.from("celebrations").remove([path]);
    throw (
      error ||
      Error(
        "This celebration changed while you were editing. Refresh and try again.",
      )
    );
  }
}
export async function setStatus(
  item: Celebration,
  status: "approved" | "rejected" | "removed",
) {
  const { data, error } = await client()
    .from("celebrations")
    .update({ status })
    .eq("id", item.id)
    .eq("status", item.status)
    .select("id");
  if (error) throw error;
  if (!data?.length)
    throw Error("This celebration has already changed. Refresh and try again.");
}
export async function createPlaybackKey(label: string, userId: string) {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const token_hash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  const { error } = await client()
    .from("celebration_playback_keys")
    .insert({ label, token_hash, created_by: userId });
  if (error) throw error;
  return token;
}
export function projectUrl() {
  return import.meta.env.VITE_SUPABASE_URL as string;
}
