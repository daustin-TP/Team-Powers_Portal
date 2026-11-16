import { createClient } from "@supabase/supabase-js";

// These are public browser credentials, not server secrets. Keep production
// connected even when a local deploy shell does not have a Vite env file.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)
  || "https://mrtihimklvztdpwjfvtz.supabase.co";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  || "sb_publishable_MnQQvm6fithIDbY2gEiuoA_Dk1OlnMK";

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

