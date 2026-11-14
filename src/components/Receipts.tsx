import { FormEvent, useEffect, useState } from "react";
import { Camera, Check, FileImage, Upload } from "lucide-react";
import type { Profile } from "../types";
import { supabase } from "../lib/supabase";

type Store={id:string;name:string;store_number:string|null};
type BillingScope=""|"selected_stores"|"all_stores"|"hq_admin";

export default function Receipts({ profile }: { profile: Profile }) {
  const [fileName, setFileName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [categories,setCategories]=useState<string[]>(["Food and supplies","Repairs and maintenance","Office","Travel","Other"]);
  const [stores,setStores]=useState<Store[]>([]),[billingScope,setBillingScope]=useState<BillingScope>(""),[billingStoreIds,setBillingStoreIds]=useState<string[]>([]);
  useEffect(()=>{if(!supabase)return;void Promise.all([supabase.from("receipt_categories").select("name").eq("active",true).order("name"),supabase.from("stores").select("id,name,store_number").eq("active",true).order("store_number")]).then(([categoriesResult,storesResult])=>{if(categoriesResult.data?.length)setCategories(categoriesResult.data.map(x=>x.name));setStores((storesResult.data??[]) as Store[]);});},[]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || !billingScope || (billingScope==="selected_stores"&&!billingStoreIds.length)) {setError("Choose where this charge should be billed.");return;}
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
        billing_scope: billingScope,
        billing_store_ids: billingScope==="selected_stores"?billingStoreIds:[],
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
        <h1>Company Credit Charges</h1>
        <p>Upload a clear receipt and tell accounting which store or business area should receive the charge.</p>
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
            <label>Category<select name="category" required defaultValue=""><option value="" disabled>Select a category</option>{categories.map(category=><option key={category}>{category}</option>)}</select></label>
          </div>
          <label>Business purpose<textarea name="business_purpose" rows={3} placeholder="Briefly explain what was purchased and why" required /></label>
          <fieldset className="receipt-billing"><legend>Where should this charge be billed?</legend><p>Select one company-wide option or choose one or more stores.</p><label className="check-row"><input type="radio" name="billing_scope" checked={billingScope==="all_stores"} onChange={()=>{setBillingScope("all_stores");setBillingStoreIds([]);}}/><span>All stores</span></label><label className="check-row"><input type="radio" name="billing_scope" checked={billingScope==="hq_admin"} onChange={()=>{setBillingScope("hq_admin");setBillingStoreIds([]);}}/><span>HQ / Admin purchase</span></label><label className="check-row"><input type="radio" name="billing_scope" checked={billingScope==="selected_stores"} onChange={()=>setBillingScope("selected_stores")}/><span>Selected store(s)</span></label>{billingScope==="selected_stores"&&<div className="receipt-store-checklist">{stores.map(store=><label key={store.id}><input type="checkbox" checked={billingStoreIds.includes(store.id)} onChange={event=>setBillingStoreIds(current=>event.target.checked?[...current,store.id]:current.filter(id=>id!==store.id))}/><span>{store.store_number?`${store.store_number} — `:""}{store.name}</span></label>)}</div>}</fieldset>
          <div className="security-note"><span>Submitting as <strong>{profile.fullName}</strong> · {profile.location}</span></div>
          {error && <p className="form-error">{error}</p>}
          <button className="button primary" disabled={!fileName || submitting || !billingScope || (billingScope==="selected_stores"&&!billingStoreIds.length)}>
            {submitting ? "Uploading…" : "Submit receipt"}
          </button>
        </form>
      )}
    </div>
  );
}
