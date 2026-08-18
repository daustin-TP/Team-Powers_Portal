import { FormEvent, useState } from "react";
import { Camera, Check, FileImage, Upload } from "lucide-react";
import type { Profile } from "../types";
import { supabase } from "../lib/supabase";

export default function Receipts({ profile }: { profile: Profile }) {
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;
    setError("");
    setSubmitting(true);
    if (supabase) {
      const form = new FormData(event.currentTarget);
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const storagePath = `${profile.id}/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("receipts")
        .upload(storagePath, file, { upsert: false });
      if (uploadError) {
        setError("The receipt file could not be uploaded. Please try again.");
        setSubmitting(false);
        return;
      }
      const amountText = String(form.get("amount") ?? "").replace(/[$,\s]/g, "");
      const { error: saveError } = await supabase.from("card_receipts").insert({
        employee_id: profile.id,
        purchase_date: form.get("purchase_date"),
        vendor: form.get("vendor"),
        amount: Number(amountText),
        category: form.get("category"),
        business_purpose: form.get("business_purpose"),
        storage_path: storagePath,
        status: "submitted",
      });
      if (saveError) {
        await supabase.storage.from("receipts").remove([storagePath]);
        setError("The receipt details could not be saved. Please try again.");
        setSubmitting(false);
        return;
      }
    }
    setSubmitting(false);
    setSubmitted(true);
  };
  return (
    <div className="page narrow-page">
      <div className="page-heading">
        <p className="eyebrow">Corporate card</p>
        <h1>Submit a receipt.</h1>
        <p>Upload a clear image and tell accounting what the purchase was for.</p>
      </div>
      {submitted ? (
        <section className="success-card">
          <span><Check size={26} /></span>
          <h2>Receipt submitted</h2>
          <p>Accounting can now review and reconcile this purchase.</p>
          <button className="button secondary" onClick={() => setSubmitted(false)}>Submit another receipt</button>
        </section>
      ) : (
        <form className="panel receipt-form" onSubmit={submit}>
          <label className="upload-zone">
            <input type="file" accept="image/*,.pdf" capture="environment" onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setFileName(selected?.name ?? "");
            }} />
            {fileName ? <FileImage size={32} /> : <Upload size={32} />}
            <strong>{fileName || "Upload or photograph the receipt"}</strong>
            <span>JPG, PNG, HEIC, or PDF · Make sure the total is readable</span>
            <span className="mobile-camera"><Camera size={16} /> Camera available on mobile</span>
          </label>
          <div className="form-grid">
            <label>Purchase date<input name="purchase_date" type="date" required /></label>
            <label>Total amount<input name="amount" inputMode="decimal" placeholder="$0.00" required /></label>
            <label>Vendor<input name="vendor" placeholder="Vendor or store name" required /></label>
            <label>Category<select name="category" required defaultValue=""><option value="" disabled>Select a category</option><option>Food and supplies</option><option>Repairs and maintenance</option><option>Office</option><option>Travel</option><option>Other</option></select></label>
          </div>
          <label>Business purpose<textarea name="business_purpose" rows={3} placeholder="Briefly explain what was purchased and why" required /></label>
          <div className="security-note"><span>Submitting as <strong>{profile.fullName}</strong> · {profile.location}</span></div>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary" disabled={!fileName || submitting}>
            {submitting ? "Uploading…" : "Submit receipt"}
          </button>
        </form>
      )}
    </div>
  );
}

