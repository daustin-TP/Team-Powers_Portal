import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import type { Profile } from "../types";

type Store = { id: string; name: string };
type Family = "kpi_weekly" | "labor_sales" | "labor_oven_items" | "labor_deliveries" | "labor_baseline_bundle";
type Batch = {
  id: string; report_family: Family; period_end: string; original_filename: string;
  status: string; row_count: number; error_message: string | null; created_at: string;
  stores?: { name?: string } | Array<{ name?: string }> | null;
};

const familyLabels: Record<Family, string> = {
  kpi_weekly: "Weekly KPI report",
  labor_sales: "Labor · Royalty Sales",
  labor_oven_items: "Labor · All Oven Items",
  labor_deliveries: "Labor · Delivery Orders",
  labor_baseline_bundle: "Labor · Historical ZIP (all stores)",
};

function latestSunday() {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - date.getDay());
  return date.toISOString().slice(0, 10);
}

async function sha256(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export default function ReportImportCenter({ profile }: { profile: Profile }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [family, setFamily] = useState<Family>("kpi_weekly");
  const [periodEnd, setPeriodEnd] = useState(latestSunday());
  const [file, setFile] = useState<File | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    if (!isSupabaseConfigured || !supabase) { setLoading(false); return; }
    setLoading(true);
    const [storeResult, batchResult] = await Promise.all([
      supabase.from("stores").select("id,name").eq("active", true).order("name"),
      supabase.from("report_import_batches").select("id,report_family,period_end,original_filename,status,row_count,error_message,created_at,stores(name)").order("created_at", { ascending: false }).limit(50),
    ]);
    if (storeResult.error || batchResult.error) setError(storeResult.error?.message || batchResult.error?.message || "Imports could not be loaded. Apply the KPI + Labor migration first.");
    const nextStores = (storeResult.data ?? []) as Store[];
    setStores(nextStores); setStoreId((current) => current || nextStores[0]?.id || ""); setBatches((batchResult.data ?? []) as Batch[]); setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const upload = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !file || !storeId) { setError("Select a store, report type, week, and file."); return; }
    setUploading(true); setError(""); setMessage("");
    const fingerprint = await sha256(file);
    const { data: duplicate } = await supabase.from("report_import_batches").select("id,status").eq("store_id", storeId).eq("report_family", family).eq("period_end", periodEnd).eq("file_hash", fingerprint).maybeSingle();
    if (duplicate) { setError(`This exact report was already uploaded and is currently ${duplicate.status.replace("_", " ")}.`); setUploading(false); return; }
    const safeName = file.name.replace(/[^a-z0-9._-]+/gi, "-");
    const storagePath = `${storeId}/${periodEnd}/${crypto.randomUUID()}-${safeName}`;
    const { error: storageError } = await supabase.storage.from("operating-reports").upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
    if (storageError) { setError(storageError.message); setUploading(false); return; }
    const { data: batch, error: insertError } = await supabase.from("report_import_batches").insert({
      store_id: storeId, report_family: family, period_end: periodEnd, original_filename: file.name,
      storage_path: storagePath, file_hash: fingerprint, status: "uploaded", uploaded_by: profile.id,
    }).select("id").single();
    if (insertError) { setError(insertError.message); setUploading(false); return; }
    const { data: importResult, error: invokeError } = await supabase.functions.invoke("report-import", { body: { batch_id: batch.id } });
    const importMode = importResult?.metadata?.mode === "baseline_bundle" ? `${importResult.metadata.filesImported}-file historical bundle` : importResult?.metadata?.mode === "baseline" ? `${importResult.metadata.weeks}-week ${String(importResult.metadata.season).replace("_", "-")} baseline` : "weekly actual";
    setMessage(invokeError
      ? "Report is safely uploaded, but automated processing is not deployed or returned an error. Review the audit row below."
      : `Report processed as ${importMode}: ${importResult?.rowCount ?? 0} interval records, status ${String(importResult?.status ?? "ready").replace("_", " ")}.`);
    setFile(null); setUploading(false); await load();
  };

  return (
    <div className="page import-page">
      <section className="page-heading"><p className="eyebrow">Monday workflow</p><h1>Weekly Data Imports</h1><p>Upload the original Wizardline reports directly to Dash-OS. The system keeps the source file, validates it, and writes clean historical records to Supabase—no spreadsheet copying required.</p></section>
      {error && <p className="inline-message labor-error"><AlertTriangle size={18} />{error}</p>}
      {message && <p className="inline-message labor-success"><CheckCircle2 size={18} />{message}</p>}
      <div className="import-layout">
        <form className="panel import-form" onSubmit={upload}>
          <div className="panel-heading"><div><p className="eyebrow">Add a report</p><h2>Upload original file</h2></div><UploadCloud size={25} /></div>
          <label>Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)} required><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
          <label>Report type<select value={family} onChange={(event) => { const next = event.target.value as Family; setFamily(next); if (next === "labor_baseline_bundle") { const allStores = stores.find((store) => store.name === "All Stores"); if (allStores) setStoreId(allStores.id); } }}>{Object.entries(familyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>{family === "kpi_weekly" ? "Week ending" : "Report period ending"}<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} required /></label>
          <label className="file-drop"><FileSpreadsheet /><span>{file ? file.name : "Choose PDF, Excel, CSV, or ZIP report"}</span><input type="file" accept=".pdf,.xlsx,.xls,.csv,.zip" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /></label>
          <div className="import-guidance"><strong>Wizardline report checklist</strong><span>Weekly Summary · 15-minute intervals · original Excel file</span><span>Labor requires Sales, All Oven Items, and Delivery Orders for each store.</span><span>For a historical backfill, choose Historical ZIP and upload every store report together.</span><span>One-week reports save actual results. Multi-week Monday–Sunday reports automatically become seasonal averages.</span><span>Keep daylight and non-daylight dates in separate ZIPs.</span><span>KPI uses the same weekly operations report currently provided on Monday.</span></div>
          <button className="button primary full" disabled={uploading || !isSupabaseConfigured}><UploadCloud size={17} />{uploading ? "Uploading…" : "Upload and process"}</button>
          {!isSupabaseConfigured && <p className="security-note">Connect Supabase to enable live imports.</p>}
        </form>
        <section className="panel table-panel import-history"><div className="table-toolbar"><div><p className="eyebrow">Audit trail</p><h2>Recent uploads</h2><p>Duplicate files are detected by store, report type, period, and file fingerprint.</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} />Refresh</button></div>
          {loading ? <div className="activity-empty">Loading import history…</div> : batches.length === 0 ? <div className="activity-empty">No reports uploaded yet.</div> : <div className="responsive-table"><table><thead><tr><th>Store</th><th>Report</th><th>Period</th><th>File</th><th>Status</th><th>Rows</th></tr></thead><tbody>{batches.map((batch) => { const store = Array.isArray(batch.stores) ? batch.stores[0]?.name : batch.stores?.name; return <tr key={batch.id}><td>{store || "—"}</td><td>{familyLabels[batch.report_family]}</td><td>{batch.period_end}</td><td>{batch.original_filename}</td><td><span className={`import-status ${batch.status}`}>{batch.status.replace("_", " ")}</span>{batch.error_message && <small>{batch.error_message}</small>}</td><td>{batch.row_count || "—"}</td></tr>; })}</tbody></table></div>}
        </section>
      </div>
    </div>
  );
}
