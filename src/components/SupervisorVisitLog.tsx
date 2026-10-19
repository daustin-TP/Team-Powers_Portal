import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FilePenLine,
  ImagePlus,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type Store = { id: string; name: string; store_number: string | null };
type Rating = "" | "yes" | "no" | "na";
type ProductRating = "" | "great" | "remake";
type VisitStatus = "draft" | "submitted";
type CheckAnswer = { rating: Rating; comment: string };
type ProductAnswer = { rating: ProductRating; comment: string };
type StoreGoals = { posted: "" | "yes" | "no"; needsAdjustment: string; onTrack: string };
type UrgentItem = { item: string; assignedTo: string; completionTime: string };
type FollowUp = { item: string; owner: string; dueDate: string; completed: boolean };

type VisitForm = {
  managerName: string;
  visitDate: string;
  visitTime: string;
  checks: Record<string, CheckAnswer>;
  products: Record<string, ProductAnswer>;
  goals: StoreGoals;
  urgentItems: UrgentItem[];
  keyWins: string[];
  opportunities: string[];
  followUps: FollowUp[];
};

type VisitLog = {
  id: string;
  supervisor_id: string;
  supervisor_name: string;
  store_id: string;
  visit_date: string;
  visit_time: string | null;
  manager_name: string | null;
  status: VisitStatus;
  form_data: VisitForm;
  completion_percent: number;
  sections_touched: number;
  issues_found: number;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

type VisitPhoto = {
  id: string;
  visit_log_id: string;
  section_key: string;
  storage_path: string;
  original_name: string;
  caption: string | null;
  created_at: string;
  url?: string;
};

type Step = { key: string; label: string; short: string };

const checkGroups = {
  carry: [
    ["outside_entry", "Outside entry professional & clean"],
    ["carryout_lobby", "Carry-out lobby clean & presentable"],
    ["glass_clean", "All glass clean, including drive-through"],
    ["tv_monitors", "All TV monitors working"],
  ],
  dough: [
    ["dough_window", "All dough within window of use"],
    ["dough_room_temp", "All sizes at room temperature"],
    ["dough_proofed", "Dough properly proofed"],
    ["dough_sizes", "All sizes available"],
  ],
  food: [
    ["shelf_life", "Products within shelf life"],
    ["thermometers", "Thermometers in use"],
    ["products_dated", "All products properly dated"],
    ["temperatures", "Proper temperatures (coolers/walk-ins)"],
    ["sauce_management", "Sauce management (RTU, no walk-in bottles)"],
  ],
  employee: [
    ["uniform_attire", "All team members in proper uniform/attire"],
    ["grooming", "Grooming standards maintained"],
    ["work_area", "Work area clean and organized"],
    ["office_clean", "Office clean"],
    ["food_handling", "Proper food handling and gloves available"],
  ],
  systems: [
    ["menus", "Menus going out with every order"],
    ["car_toppers", "Car toppers on"],
    ["hot_bags", "Hot bags clean"],
    ["prep_list", "Daily prep list in use"],
    ["food_order", "Food order process followed"],
    ["schedule_labor", "Schedule / labor in place"],
    ["maintenance", "Maintenance issues"],
    ["prp_sheet", "PRP sheet"],
    ["dough_projection", "Dough projection sheets in use"],
    ["promo_training", "Team trained on current promos"],
  ],
  overall: [
    ["interior", "Interior clean & organized"],
    ["exterior", "Exterior clean (parking lot, walkways, dumpster)"],
    ["restrooms", "Restrooms clean & stocked"],
    ["coke_cooler", "Coke cooler stocked"],
    ["overall_grooming", "Grooming standards maintained"],
    ["equipment", "Equipment clean and in good condition"],
  ],
} as const;

const productItems = ["Pizza 1", "Pizza 2", "Pizza 3", "Pizza 4", "Pizza 5", "5-Cut Test", "Scale / Job Aids in Use", "Baking Equipment Clean"];
const steps: Step[] = [
  { key: "details", label: "Visit details", short: "Details" },
  { key: "carry", label: "Carry-out experience", short: "Carry-out" },
  { key: "product", label: "Product evaluation", short: "Product" },
  { key: "dough_food", label: "Dough & food safety", short: "Food safety" },
  { key: "employee", label: "Employee work area", short: "Work area" },
  { key: "urgent", label: "Urgent items", short: "Urgent" },
  { key: "systems", label: "Systems & operations", short: "Systems" },
  { key: "goals", label: "Store goals", short: "Goals" },
  { key: "recap", label: "Overall image & recap", short: "Recap" },
  { key: "review", label: "Review & submit", short: "Review" },
];

const centralDate = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const emptyForm = (): VisitForm => ({
  managerName: "",
  visitDate: centralDate(),
  visitTime: "",
  checks: {},
  products: {},
  goals: { posted: "", needsAdjustment: "", onTrack: "" },
  urgentItems: Array.from({ length: 4 }, () => ({ item: "", assignedTo: "", completionTime: "" })),
  keyWins: ["", "", ""],
  opportunities: ["", "", ""],
  followUps: Array.from({ length: 4 }, () => ({ item: "", owner: "", dueDate: "", completed: false })),
});

const normalizeForm = (value?: Partial<VisitForm> | null): VisitForm => ({
  ...emptyForm(),
  ...(value ?? {}),
  checks: value?.checks ?? {},
  products: value?.products ?? {},
  goals: value?.goals ?? { posted: "", needsAdjustment: "", onTrack: "" },
  urgentItems: Array.from({ length: 4 }, (_, index) => value?.urgentItems?.[index] ?? { item: "", assignedTo: "", completionTime: "" }),
  keyWins: Array.from({ length: 3 }, (_, index) => value?.keyWins?.[index] ?? ""),
  opportunities: Array.from({ length: 3 }, (_, index) => value?.opportunities?.[index] ?? ""),
  followUps: Array.from({ length: 4 }, (_, index) => value?.followUps?.[index] ?? { item: "", owner: "", dueDate: "", completed: false }),
});

const allChecks = Object.values(checkGroups).flat();
const formStats = (form: VisitForm, storeId: string) => {
  const expected = 4 + allChecks.length + productItems.length;
  let complete = Number(Boolean(storeId)) + Number(Boolean(form.managerName.trim())) + Number(Boolean(form.visitDate));
  complete += allChecks.filter(([key]) => Boolean(form.checks[key]?.rating)).length;
  complete += productItems.filter((_, index) => Boolean(form.products[`product_${index}`]?.rating)).length;
  complete += Number(Boolean(form.goals.posted));
  const sectionTouched = (key: string) => {
    if (key === "details") return Boolean(storeId || form.managerName || form.visitTime);
    if (key === "carry") return checkGroups.carry.some(([id]) => form.checks[id]?.rating || form.checks[id]?.comment);
    if (key === "product") return Object.values(form.products).some((item) => item.rating || item.comment);
    if (key === "dough_food") return [...checkGroups.dough, ...checkGroups.food].some(([id]) => form.checks[id]?.rating || form.checks[id]?.comment);
    if (key === "urgent") return form.urgentItems.some((item) => item.item || item.assignedTo || item.completionTime);
    if (key === "employee") return checkGroups.employee.some(([id]) => form.checks[id]?.rating || form.checks[id]?.comment);
    if (key === "systems") return checkGroups.systems.some(([id]) => form.checks[id]?.rating || form.checks[id]?.comment);
    if (key === "goals") return Boolean(form.goals.posted || form.goals.needsAdjustment || form.goals.onTrack);
    if (key === "recap") return checkGroups.overall.some(([id]) => form.checks[id]?.rating || form.checks[id]?.comment)
      || form.keyWins.some(Boolean) || form.opportunities.some(Boolean) || form.followUps.some((item) => item.item || item.owner || item.dueDate);
    return false;
  };
  const issues = Object.values(form.checks).filter((item) => item.rating === "no").length
    + Object.values(form.products).filter((item) => item.rating === "remake").length
    + Number(form.goals.posted === "no");
  return {
    percent: Math.round((complete / expected) * 100),
    missing: expected - complete,
    sections: steps.slice(0, -1).filter((step) => sectionTouched(step.key)).length,
    issues,
  };
};

const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatTime = (value: string | null) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "Time not entered";

export default function SupervisorVisitLog({ profile }: { profile: Profile }) {
  const [stores, setStores] = useState<Store[]>([]);
  const [logs, setLogs] = useState<VisitLog[]>([]);
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [selected, setSelected] = useState<VisitLog | null>(null);
  const [logId, setLogId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [form, setForm] = useState<VisitForm>(emptyForm);
  const [stepIndex, setStepIndex] = useState(0);
  const [showEditor, setShowEditor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | VisitStatus>("all");
  const [storeFilter, setStoreFilter] = useState("all");

  const readOnly = selected?.status === "submitted" || Boolean(selected && selected.supervisor_id !== profile.id);
  const stats = useMemo(() => formStats(form, storeId), [form, storeId]);

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const [storeResult, logResult, photoResult] = await Promise.all([
      supabase.from("stores").select("id,name,store_number").eq("active", true).order("name"),
      supabase.from("supervisor_visit_logs").select("*").order("visit_date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("supervisor_visit_log_photos").select("id,visit_log_id"),
    ]);
    if (storeResult.error || logResult.error || photoResult.error) {
      setMessage(storeResult.error?.message || logResult.error?.message || photoResult.error?.message || "Visit logs could not be loaded.");
    } else {
      const nextStores = (storeResult.data ?? []) as Store[];
      setStores(nextStores);
      setLogs((logResult.data ?? []).map((item) => ({ ...item, form_data: normalizeForm(item.form_data) })) as VisitLog[]);
      setStoreId((current) => current || nextStores[0]?.id || "");
      const counts: Record<string, number> = {};
      (photoResult.data ?? []).forEach((item: { visit_log_id: string }) => { counts[item.visit_log_id] = (counts[item.visit_log_id] ?? 0) + 1; });
      setPhotoCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, [profile.id]);

  const loadPhotos = async (id: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("supervisor_visit_log_photos").select("*").eq("visit_log_id", id).order("created_at");
    if (error) { setMessage(error.message); return; }
    const next = await Promise.all(((data ?? []) as VisitPhoto[]).map(async (photo) => {
      const { data: signed } = await supabase!.storage.from("supervisor-visit-photos").createSignedUrl(photo.storage_path, 3600);
      return { ...photo, url: signed?.signedUrl };
    }));
    setPhotos(next);
  };

  const openNew = () => {
    setSelected(null);
    setLogId(null);
    setStoreId(stores[0]?.id ?? "");
    setForm(emptyForm());
    setPhotos([]);
    setStepIndex(0);
    setShowEditor(true);
    setMessage("");
  };

  const openLog = async (log: VisitLog) => {
    setSelected(log);
    setLogId(log.id);
    setStoreId(log.store_id);
    setForm(normalizeForm(log.form_data));
    setStepIndex(log.status === "submitted" ? 9 : 0);
    setShowEditor(true);
    setMessage("");
    await loadPhotos(log.id);
  };

  const persist = async (status: VisitStatus = "draft") => {
    if (!supabase || saving) return null;
    if (!storeId) { setMessage("Choose a store before saving this visit."); return null; }
    setSaving(true);
    setMessage("");
    const payload = {
      supervisor_id: profile.id,
      supervisor_name: profile.fullName,
      store_id: storeId,
      visit_date: form.visitDate || centralDate(),
      visit_time: form.visitTime || null,
      manager_name: form.managerName.trim() || null,
      status,
      form_data: form,
      completion_percent: stats.percent,
      sections_touched: stats.sections,
      issues_found: stats.issues,
      submitted_at: status === "submitted" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const result = logId
      ? await supabase.from("supervisor_visit_logs").update(payload).eq("id", logId).select("*").single()
      : await supabase.from("supervisor_visit_logs").insert(payload).select("*").single();
    setSaving(false);
    if (result.error || !result.data) { setMessage(result.error?.message ?? "The visit could not be saved."); return null; }
    const saved = { ...result.data, form_data: normalizeForm(result.data.form_data) } as VisitLog;
    setLogId(saved.id);
    setSelected(saved);
    setMessage(status === "submitted" ? "Visit submitted and preserved in the Supervisor Visit Log." : "Draft saved. You can leave and return to finish it later.");
    await load();
    return saved;
  };

  const submitVisit = async () => {
    if (stats.percent < 100 && !window.confirm(`This visit is ${stats.percent}% complete and has ${stats.missing} unanswered items. Submit it anyway?`)) return;
    const saved = await persist("submitted");
    if (saved) { setShowEditor(false); setSelected(null); }
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!supabase || !files?.length || readOnly) return;
    let id = logId;
    if (!id) id = (await persist("draft"))?.id ?? null;
    if (!id) return;
    setUploading(true);
    setMessage("");
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) { setMessage(`${file.name} is not an image and was skipped.`); continue; }
      const safeName = file.name.replace(/[^a-z0-9._-]/gi, "-");
      const path = `${profile.id}/${id}/${crypto.randomUUID()}-${safeName}`;
      const linked = await supabase.from("supervisor_visit_log_photos").insert({
        visit_log_id: id,
        uploaded_by: profile.id,
        section_key: steps[stepIndex].key,
        storage_path: path,
        original_name: file.name,
      }).select("id").single();
      if (linked.error || !linked.data) { setMessage(linked.error?.message ?? "The photo record could not be created."); continue; }
      const uploaded = await supabase.storage.from("supervisor-visit-photos").upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) {
        await supabase.from("supervisor_visit_log_photos").delete().eq("id", linked.data.id);
        setMessage(uploaded.error.message);
      }
    }
    setUploading(false);
    await loadPhotos(id);
    await load();
  };

  const updatePhotoCaption = async (photo: VisitPhoto, caption: string) => {
    if (!supabase || readOnly) return;
    const { error } = await supabase.from("supervisor_visit_log_photos").update({ caption: caption.trim() || null }).eq("id", photo.id);
    if (error) setMessage(error.message);
    else setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, caption } : item));
  };

  const deletePhoto = async (photo: VisitPhoto) => {
    if (!supabase || readOnly || !window.confirm("Remove this photo from the draft visit?")) return;
    const removed = await supabase.storage.from("supervisor-visit-photos").remove([photo.storage_path]);
    if (removed.error) { setMessage(removed.error.message); return; }
    const { error } = await supabase.from("supervisor_visit_log_photos").delete().eq("id", photo.id);
    if (error) { setMessage(error.message); return; }
    setPhotos((current) => current.filter((item) => item.id !== photo.id));
    await load();
  };

  const setCheck = (key: string, patch: Partial<CheckAnswer>) => setForm((current) => ({
    ...current,
    checks: { ...current.checks, [key]: { ...(current.checks[key] ?? { rating: "", comment: "" }), ...patch } },
  }));
  const setProduct = (key: string, patch: Partial<ProductAnswer>) => setForm((current) => ({
    ...current,
    products: { ...current.products, [key]: { ...(current.products[key] ?? { rating: "", comment: "" }), ...patch } },
  }));
  const renderRating = (value: Rating, onChange: (value: Rating) => void) => <div className="visit-rating" role="group" aria-label="Rating">
    {(["yes", "no", "na"] as Rating[]).map((item) => <button type="button" key={item} className={`${item} ${value === item ? "selected" : ""}`} onClick={() => onChange(item)} disabled={readOnly}>
      {item === "yes" ? <Check size={15} /> : item === "no" ? <XCircle size={15} /> : null}{item === "na" ? "N/A" : item.toUpperCase()}
    </button>)}
  </div>;

  const renderCheckGroup = (title: string, items: readonly (readonly [string, string])[]) => <section className="visit-check-group">
    <h3>{title}</h3>
    {items.map(([key, label]) => <article className="visit-check-row" key={key}>
      <div><strong>{label}</strong>{renderRating(form.checks[key]?.rating ?? "", (rating) => setCheck(key, { rating }))}</div>
      <textarea rows={2} value={form.checks[key]?.comment ?? ""} onChange={(event) => setCheck(key, { comment: event.target.value })} placeholder="Comments / coaching (optional)" disabled={readOnly} />
    </article>)}
  </section>;

  const sectionPhotos = photos.filter((photo) => photo.section_key === steps[stepIndex].key);
  const photoArea = stepIndex > 0 && stepIndex < 9 ? <section className="visit-photo-area">
    <div><Camera size={21} /><div><strong>{steps[stepIndex].key === "goals" ? "Photo of the posted goals" : "Photos for this section"}</strong><small>{steps[stepIndex].key === "goals" ? "Add a current photo of the in-store goal board or posted goals." : "Add supporting photos from the phone camera or photo library."}</small></div></div>
    {!readOnly && <label className="button secondary visit-photo-button"><ImagePlus size={17} />{uploading ? "Uploading…" : "Add photos"}<input type="file" accept="image/*,.heic,.heif" multiple disabled={uploading} onChange={(event) => void uploadPhotos(event.target.files)} /></label>}
    {sectionPhotos.length > 0 && <div className="visit-photo-grid">{sectionPhotos.map((photo) => <article key={photo.id}>
      {photo.url ? <img src={photo.url} alt={photo.caption || photo.original_name} /> : <div className="visit-photo-placeholder">Photo</div>}
      <input value={photo.caption ?? ""} onChange={(event) => setPhotos((current) => current.map((item) => item.id === photo.id ? { ...item, caption: event.target.value } : item))} onBlur={(event) => void updatePhotoCaption(photo, event.target.value)} placeholder="Add a note about this photo" disabled={readOnly} />
      {!readOnly && <button className="icon-button danger" type="button" aria-label="Remove photo" onClick={() => void deletePhoto(photo)}><Trash2 size={16} /></button>}
    </article>)}</div>}
  </section> : null;

  const renderStep = () => {
    const key = steps[stepIndex].key;
    if (key === "details") return <div className="visit-details-grid">
      <label>Store<select value={storeId} onChange={(event) => setStoreId(event.target.value)} disabled={readOnly}><option value="">Select store</option>{stores.map((store) => <option value={store.id} key={store.id}>{store.name} {store.store_number ?? ""}</option>)}</select></label>
      <label>Date<input type="date" value={form.visitDate} onChange={(event) => setForm((current) => ({ ...current, visitDate: event.target.value }))} disabled={readOnly} /></label>
      <label>Visit time <span className="optional-label">Optional</span><input type="time" value={form.visitTime} onChange={(event) => setForm((current) => ({ ...current, visitTime: event.target.value }))} disabled={readOnly} /></label>
      <label>Manager on duty<input value={form.managerName} onChange={(event) => setForm((current) => ({ ...current, managerName: event.target.value }))} placeholder="First and last name" disabled={readOnly} /></label>
      <div className="visit-owner-card"><ShieldCheck /><div><small>Visited by</small><strong>{profile.fullName}</strong><span>{profile.role === "admin" ? "Administrator" : "Supervisor"}</span></div></div>
    </div>;
    if (key === "carry") return renderCheckGroup("Carry-out experience", checkGroups.carry);
    if (key === "product") return <section className="visit-check-group"><h3>Product evaluation</h3>{productItems.map((label, index) => {
      const itemKey = `product_${index}`; const item = form.products[itemKey] ?? { rating: "", comment: "" };
      return <article className="visit-check-row" key={itemKey}><div><strong>{label}</strong><div className="visit-rating product"><button type="button" className={`yes ${item.rating === "great" ? "selected" : ""}`} onClick={() => setProduct(itemKey, { rating: "great" })} disabled={readOnly}>Great</button><button type="button" className={`no ${item.rating === "remake" ? "selected" : ""}`} onClick={() => setProduct(itemKey, { rating: "remake" })} disabled={readOnly}>Remake</button></div></div><textarea rows={2} value={item.comment} onChange={(event) => setProduct(itemKey, { comment: event.target.value })} placeholder="Comments / how to coach" disabled={readOnly} /></article>;
    })}</section>;
    if (key === "dough_food") return <div className="visit-double-groups">{renderCheckGroup("Dough management", checkGroups.dough)}{renderCheckGroup("Food safety & product management", checkGroups.food)}</div>;
    if (key === "urgent") return <section className="visit-line-items"><h3>Urgent items to be completed by EOD</h3>{form.urgentItems.map((item, index) => <article key={index}><label>Item<textarea rows={2} value={item.item} onChange={(event) => setForm((current) => ({ ...current, urgentItems: current.urgentItems.map((entry, i) => i === index ? { ...entry, item: event.target.value } : entry) }))} placeholder="What must be completed?" disabled={readOnly} /></label><label>Assigned to<input value={item.assignedTo} onChange={(event) => setForm((current) => ({ ...current, urgentItems: current.urgentItems.map((entry, i) => i === index ? { ...entry, assignedTo: event.target.value } : entry) }))} disabled={readOnly} /></label><label>Completion time<input type="time" value={item.completionTime} onChange={(event) => setForm((current) => ({ ...current, urgentItems: current.urgentItems.map((entry, i) => i === index ? { ...entry, completionTime: event.target.value } : entry) }))} disabled={readOnly} /></label></article>)}</section>;
    if (key === "employee") return renderCheckGroup("Employee work area", checkGroups.employee);
    if (key === "systems") return renderCheckGroup("Systems & operations", checkGroups.systems);
    if (key === "goals") return <section className="visit-goals">
      <div className="visit-goals-intro"><div><p className="eyebrow">In-store accountability</p><h3>Are store goals posted and updated?</h3><p>The KPI Dashboard remains the detailed performance source. This section confirms that the team can see the current priorities in the store.</p></div><div className="visit-rating goals" role="group" aria-label="Are store goals posted and updated?">
        <button type="button" className={`yes ${form.goals.posted === "yes" ? "selected" : ""}`} onClick={() => setForm((current) => ({ ...current, goals: { ...current.goals, posted: "yes" } }))} disabled={readOnly}><Check size={15} />Yes</button>
        <button type="button" className={`no ${form.goals.posted === "no" ? "selected" : ""}`} onClick={() => setForm((current) => ({ ...current, goals: { ...current.goals, posted: "no" } }))} disabled={readOnly}><XCircle size={15} />No</button>
      </div></div>
      <div className="visit-goal-notes"><label>What goals need to be adjusted?<textarea rows={5} value={form.goals.needsAdjustment} onChange={(event) => setForm((current) => ({ ...current, goals: { ...current.goals, needsAdjustment: event.target.value } }))} placeholder="Note the goal, why it needs adjustment, and the next action…" disabled={readOnly} /></label><label>What goals are on track to hit?<textarea rows={5} value={form.goals.onTrack} onChange={(event) => setForm((current) => ({ ...current, goals: { ...current.goals, onTrack: event.target.value } }))} placeholder="Record what is working and should be reinforced…" disabled={readOnly} /></label></div>
    </section>;
    if (key === "recap") return <div className="visit-recap">{renderCheckGroup("Overall image", checkGroups.overall)}<div className="visit-recap-columns"><section><h3>Key wins</h3>{form.keyWins.map((value, index) => <textarea key={index} rows={2} value={value} onChange={(event) => setForm((current) => ({ ...current, keyWins: current.keyWins.map((entry, i) => i === index ? event.target.value : entry) }))} placeholder={`Win ${index + 1}`} disabled={readOnly} />)}</section><section><h3>Opportunities & coaching points</h3>{form.opportunities.map((value, index) => <textarea key={index} rows={2} value={value} onChange={(event) => setForm((current) => ({ ...current, opportunities: current.opportunities.map((entry, i) => i === index ? event.target.value : entry) }))} placeholder={`Opportunity ${index + 1}`} disabled={readOnly} />)}</section></div><section className="visit-line-items follow-up"><h3>Follow-up</h3>{form.followUps.map((item, index) => <article key={index}><label>Item<input value={item.item} onChange={(event) => setForm((current) => ({ ...current, followUps: current.followUps.map((entry, i) => i === index ? { ...entry, item: event.target.value } : entry) }))} disabled={readOnly} /></label><label>Owner<input value={item.owner} onChange={(event) => setForm((current) => ({ ...current, followUps: current.followUps.map((entry, i) => i === index ? { ...entry, owner: event.target.value } : entry) }))} disabled={readOnly} /></label><label>Due date<input type="date" value={item.dueDate} onChange={(event) => setForm((current) => ({ ...current, followUps: current.followUps.map((entry, i) => i === index ? { ...entry, dueDate: event.target.value } : entry) }))} disabled={readOnly} /></label><label className="visit-complete-toggle"><input type="checkbox" checked={item.completed} onChange={(event) => setForm((current) => ({ ...current, followUps: current.followUps.map((entry, i) => i === index ? { ...entry, completed: event.target.checked } : entry) }))} disabled={readOnly} />Completed</label></article>)}</section></div>;
    return <div className="visit-review">
      <div className={`visit-completion-ring ${stats.percent === 100 ? "complete" : ""}`}><strong>{stats.percent}%</strong><span>complete</span></div>
      <div><p className="eyebrow">Ready for review</p><h3>{stores.find((store) => store.id === storeId)?.name ?? "Store not selected"} · {formatDate(form.visitDate)}</h3><p>{stats.sections} sections touched · {stats.issues} items need attention · {photos.length} photos attached</p></div>
      {stats.percent < 100 && <div className="visit-warning"><AlertTriangle /><div><strong>This visit is not fully completed.</strong><span>{stats.missing} expected answers are blank. You may still submit it after confirming.</span></div></div>}
      <section className="visit-review-summary"><article><span>Manager</span><strong>{form.managerName || "Not entered"}</strong></article><article><span>Visit time</span><strong>{form.visitTime ? formatTime(form.visitTime) : "Not entered"}</strong></article><article><span>Issues found</span><strong>{stats.issues}</strong></article><article><span>Photo evidence</span><strong>{photos.length}</strong></article></section>
      {(form.goals.needsAdjustment || form.goals.onTrack) && <div className="visit-review-notes"><section><h4>Goals needing adjustment</h4><p>{form.goals.needsAdjustment || "None noted"}</p></section><section><h4>Goals on track</h4><p>{form.goals.onTrack || "None noted"}</p></section></div>}
      {(form.keyWins.some(Boolean) || form.opportunities.some(Boolean)) && <div className="visit-review-notes"><section><h4>Key wins</h4>{form.keyWins.filter(Boolean).map((item, index) => <p key={index}>{item}</p>)}</section><section><h4>Opportunities</h4>{form.opportunities.filter(Boolean).map((item, index) => <p key={index}>{item}</p>)}</section></div>}
    </div>;
  };

  const visibleLogs = logs.filter((log) => (statusFilter === "all" || log.status === statusFilter) && (storeFilter === "all" || log.store_id === storeFilter));
  const storeName = (id: string) => { const store = stores.find((item) => item.id === id); return store ? `${store.name}${store.store_number ? ` ${store.store_number}` : ""}` : "Store"; };

  if (showEditor) return <div className="page-stack visit-log-page">
    <header className="page-header"><div><button className="link-button" type="button" onClick={() => { setShowEditor(false); setSelected(null); }}><ArrowLeft size={16} />Back to visit log</button><p className="eyebrow">Supervisor visit</p><h1>{readOnly ? "Visit record" : logId ? "Continue visit draft" : "New store visit"}</h1><p>{readOnly ? "Submitted records are preserved as a read-only store visit history." : "Move through sections in any order. Save now and finish later if the visit does not require every section."}</p></div><div className="visit-header-status"><span className={`visit-status ${readOnly ? "submitted" : "draft"}`}>{readOnly ? "Submitted" : "Draft"}</span><strong>{stats.percent}% complete</strong></div></header>
    {message && <div className="notice">{message}</div>}
    <nav className="visit-step-nav" aria-label="Visit form sections">{steps.map((step, index) => <button type="button" key={step.key} className={index === stepIndex ? "active" : ""} onClick={() => setStepIndex(index)}><span>{index + 1}</span>{step.short}</button>)}</nav>
    <section className="panel visit-form-panel"><div className="visit-section-heading"><div><p className="eyebrow">Section {stepIndex + 1} of {steps.length}</p><h2>{steps[stepIndex].label}</h2></div>{!readOnly && <small>All fields may be skipped</small>}</div>{renderStep()}{photoArea}
      <footer className="visit-form-actions"><button className="button secondary" type="button" disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)}><ArrowLeft size={17} />Previous</button><div>{!readOnly && <button className="button secondary" type="button" disabled={saving} onClick={() => void persist("draft")}><Save size={17} />{saving ? "Saving…" : "Save draft"}</button>}{stepIndex < steps.length - 1 ? <button className="button primary" type="button" onClick={() => setStepIndex((value) => value + 1)}>Next<ArrowRight size={17} /></button> : !readOnly ? <button className="button primary" type="button" disabled={saving} onClick={() => void submitVisit()}><ClipboardCheck size={17} />Submit visit</button> : null}</div></footer>
    </section>
  </div>;

  return <div className="page-stack visit-log-page">
    <header className="page-header"><div><p className="eyebrow">District Manager records</p><h1>Supervisor Visit Log</h1><p>Save visit drafts from the store, attach photos, and submit a permanent record when the visit is ready.</p></div><button className="button primary" type="button" onClick={openNew}><Plus size={18} />New visit log</button></header>
    <div className="hr-security-banner"><ShieldCheck /><div><strong>Private leadership record</strong><span>Supervisors see only their own visits. Administrators can review all supervisor submissions.</span></div></div>
    {message && <div className="notice">{message}</div>}
    <section className="panel visit-overview"><article><ClipboardCheck /><div><strong>{logs.filter((log) => log.status === "submitted").length}</strong><span>Submitted visits</span></div></article><article><FilePenLine /><div><strong>{logs.filter((log) => log.status === "draft").length}</strong><span>Drafts in progress</span></div></article><article><AlertTriangle /><div><strong>{logs.reduce((total, log) => total + log.issues_found, 0)}</strong><span>Items flagged</span></div></article><article><Camera /><div><strong>{Object.values(photoCounts).reduce((total, count) => total + count, 0)}</strong><span>Photos attached</span></div></article></section>
    <section className="panel visit-records-panel"><div className="table-toolbar visit-log-toolbar"><div><h2>Visits by date</h2><p>{profile.role === "admin" ? "All supervisor visit records" : "Your private visit history"}</p></div><div className="hr-filters"><select value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option value="all">All stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{store.name} {store.store_number ?? ""}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="draft">Drafts</option><option value="submitted">Submitted</option></select></div></div>
      {loading ? <div className="empty-state">Loading visit records…</div> : visibleLogs.length === 0 ? <div className="empty-state"><ClipboardCheck size={34} /><h3>No visit logs yet</h3><p>Start a visit from a phone or desktop and save it at any point.</p></div> : <div className="visit-record-list">{visibleLogs.map((log) => <button type="button" key={log.id} onClick={() => void openLog(log)}>
        <div className="visit-record-date"><strong>{new Date(`${log.visit_date}T12:00:00`).toLocaleDateString("en-US", { day: "numeric" })}</strong><span>{new Date(`${log.visit_date}T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span></div>
        <div className="visit-record-main"><div><strong>{storeName(log.store_id)}</strong><span>{formatTime(log.visit_time)} · Manager: {log.manager_name || "Not entered"}</span></div>{profile.role === "admin" && <small>Visited by {log.supervisor_name}</small>}</div>
        <div className="visit-record-facts"><span><b>{log.completion_percent}%</b> complete</span><span><b>{log.issues_found}</b> flagged</span><span><b>{photoCounts[log.id] ?? 0}</b> photos</span></div>
        <span className={`visit-status ${log.status}`}>{log.status}</span><Eye size={18} />
      </button>)}</div>}
    </section>
  </div>;
}
