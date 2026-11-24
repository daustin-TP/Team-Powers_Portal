import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { supabase } from "../lib/supabase";

const bucket = "supervisor-training-photos";
export const isTrainingVisit = (purpose: string) => purpose === "Training" || purpose === "Training / coaching";

export default function TrainingVisitPhoto({ visitId }: { visitId: string }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const path = `${visitId}/photo`;

  useEffect(() => {
    let active = true;
    void supabase?.storage.from(bucket).createSignedUrl(path, 300).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? "");
    });
    return () => { active = false; };
  }, [path]);

  async function savePhoto(file?: File) {
    if (!supabase || !file || busy) return;
    if (!/^image\/(jpeg|png|webp|gif|heic|heif)$/.test(file.type) || file.size > 5 * 1024 * 1024) {
      setMessage("Choose a supported image under 5 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const storage = supabase.storage.from(bucket);
      const { error } = await storage.upload(path, file, { upsert: true, contentType: file.type, cacheControl: "0" });
      if (error) throw error;
      const signed = await storage.createSignedUrl(path, 300);
      setUrl(signed.data?.signedUrl ?? "");
      setMessage("Training photo saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The training photo could not be saved.");
    } finally { setBusy(false); }
  }

  return <section className="training-visit-photo">
    <h3>Training photo <small>(optional)</small></h3>
    {url && <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Training visit photo"/><span>Open photo</span></a>}
    <label><Camera size={16}/> {busy ? "Saving photo…" : url ? "Replace photo" : "Add photo"}
      <input aria-label="Choose training photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,.heic,.heif"
        disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void savePhoto(file); }}/>
    </label>
    {message && <p role="status">{message}</p>}
  </section>;
}
