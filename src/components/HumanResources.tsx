import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FilePenLine, History, LockKeyhole, Plus, Save, ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type Store = { id: string; name: string; store_number: string | null };
type ActionType = "coaching" | "verbal_warning" | "written_warning" | "final_warning" | "suspension" | "termination";
type HrStatus = "open" | "monitoring" | "completed";
type Acknowledgment = "pending" | "acknowledged" | "declined" | "not_required";

type DisciplinaryAction = {
  id: string;
  store_id: string;
  employee_name: string;
  employee_identifier: string | null;
  incident_date: string;
  action_type: ActionType;
  policy_category: string;
  incident_summary: string;
  action_taken: string;
  expectations: string;
  follow_up_date: string | null;
  witnesses: string;
  acknowledgment_status: Acknowledgment;
  status: HrStatus;
  confidential_notes: string;
  submitted_by: string;
  submitted_by_name: string;
  last_edited_by: string | null;
  created_at: string;
  updated_at: string;
};

type Revision = {
  id: number;
  changed_by_name: string;
  created_at: string;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
};

type FormState = {
  store_id: string;
  employee_name: string;
  employee_identifier: string;
  incident_date: string;
  action_type: ActionType;
  policy_category: string;
  incident_summary: string;
  action_taken: string;
  expectations: string;
  follow_up_date: string;
  witnesses: string;
  acknowledgment_status: Acknowledgment;
  status: HrStatus;
  confidential_notes: string;
};

const actionLabels: Record<ActionType, string> = {
  coaching: "Documented coaching",
  verbal_warning: "Verbal warning",
  written_warning: "Written warning",
  final_warning: "Final warning",
  suspension: "Suspension",
  termination: "Termination",
};

const categoryLabels: Record<string, string> = {
  attendance: "Attendance",
  conduct: "Conduct",
  performance: "Performance",
  safety: "Safety",
  cash_handling: "Cash handling",
  food_safety: "Food safety",
  harassment: "Harassment",
  insubordination: "Insubordination",
  other: "Other",
};

const today = () => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const emptyForm = (storeId = ""): FormState => ({
  store_id: storeId,
  employee_name: "",
  employee_identifier: "",
  incident_date: today(),
  action_type: "coaching",
  policy_category: "other",
  incident_summary: "",
  action_taken: "",
  expectations: "",
  follow_up_date: "",
  witnesses: "",
  acknowledgment_status: "pending",
  status: "open",
  confidential_notes: "",
});

const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const formatTimestamp = (value: string) => new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

export default function HumanResources({ profile }: { profile: Profile }) {
  const canEdit = profile.role === "supervisor" || profile.role === "admin";
  const [stores, setStores] = useState<Store[]>([]);
  const [records, setRecords] = useState<DisciplinaryAction[]>([]);
  const [selected, setSelected] = useState<DisciplinaryAction | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(profile.storeId ?? ""));
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setMessage("");
    const [storeResult, recordResult, assignmentResult] = await Promise.all([
      supabase.from("stores").select("id,name,store_number").eq("active", true).order("name"),
      supabase.from("hr_disciplinary_actions").select("*").order("incident_date", { ascending: false }).order("created_at", { ascending: false }),
      profile.role === "manager"
        ? supabase.from("profile_store_assignments").select("store_id").eq("profile_id", profile.id)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (storeResult.error || recordResult.error) {
      setMessage(storeResult.error?.message || recordResult.error?.message || "The confidential HR file could not be loaded.");
      setLoading(false);
      return;
    }
    const allStores = (storeResult.data ?? []) as Store[];
    const allowedIds = new Set<string>([
      ...(profile.storeId ? [profile.storeId] : []),
      ...((assignmentResult.data ?? []) as { store_id: string }[]).map((row) => row.store_id),
    ]);
    const visibleStores = profile.role === "manager" ? allStores.filter((store) => allowedIds.has(store.id)) : allStores;
    setStores(visibleStores);
    setRecords((recordResult.data ?? []) as DisciplinaryAction[]);
    setForm((current) => ({ ...current, store_id: current.store_id || visibleStores[0]?.id || "" }));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [profile.id]);

  const loadRevisions = async (record: DisciplinaryAction) => {
    setSelected(record);
    setShowForm(false);
    if (!supabase) return;
    const { data } = await supabase
      .from("hr_disciplinary_action_revisions")
      .select("id,changed_by_name,created_at,before_state,after_state")
      .eq("action_id", record.id)
      .order("created_at", { ascending: false });
    setRevisions((data ?? []) as Revision[]);
  };

  const filtered = useMemo(() => records.filter((record) => {
    const term = search.trim().toLowerCase();
    return (storeFilter === "all" || record.store_id === storeFilter)
      && (statusFilter === "all" || record.status === statusFilter)
      && (!term || record.employee_name.toLowerCase().includes(term) || record.incident_summary.toLowerCase().includes(term));
  }), [records, search, statusFilter, storeFilter]);

  const storeName = (id: string) => {
    const store = stores.find((item) => item.id === id);
    if (!store) return "Store record";
    return store.store_number ? `${store.name} ${store.store_number}` : store.name;
  };

  const openNew = () => {
    setSelected(null);
    setRevisions([]);
    setForm(emptyForm(form.store_id || stores[0]?.id || ""));
    setShowForm(true);
    setMessage("");
  };

  const submit = async () => {
    if (!supabase || saving) return;
    if (!form.store_id || !form.employee_name.trim() || form.incident_summary.trim().length < 10 || form.action_taken.trim().length < 5) {
      setMessage("Complete the store, employee, incident summary, and action taken before saving.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("hr_disciplinary_actions").insert({
      ...form,
      employee_name: form.employee_name.trim(),
      employee_identifier: form.employee_identifier.trim() || null,
      incident_summary: form.incident_summary.trim(),
      action_taken: form.action_taken.trim(),
      expectations: form.expectations.trim(),
      follow_up_date: form.follow_up_date || null,
      witnesses: form.witnesses.trim(),
      confidential_notes: form.confidential_notes.trim(),
      submitted_by: profile.id,
      submitted_by_name: profile.fullName,
    });
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Disciplinary action saved to the permanent confidential file.");
    setShowForm(false);
    await load();
  };

  const beginEdit = () => {
    if (!selected || !canEdit) return;
    setForm({
      store_id: selected.store_id,
      employee_name: selected.employee_name,
      employee_identifier: selected.employee_identifier ?? "",
      incident_date: selected.incident_date,
      action_type: selected.action_type,
      policy_category: selected.policy_category,
      incident_summary: selected.incident_summary,
      action_taken: selected.action_taken,
      expectations: selected.expectations,
      follow_up_date: selected.follow_up_date ?? "",
      witnesses: selected.witnesses,
      acknowledgment_status: selected.acknowledgment_status,
      status: selected.status,
      confidential_notes: selected.confidential_notes,
    });
    setShowForm(true);
  };

  const saveEdit = async () => {
    if (!supabase || !selected || !canEdit || saving) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("hr_disciplinary_actions").update({
      employee_name: form.employee_name.trim(),
      employee_identifier: form.employee_identifier.trim() || null,
      incident_date: form.incident_date,
      action_type: form.action_type,
      policy_category: form.policy_category,
      incident_summary: form.incident_summary.trim(),
      action_taken: form.action_taken.trim(),
      expectations: form.expectations.trim(),
      follow_up_date: form.follow_up_date || null,
      witnesses: form.witnesses.trim(),
      acknowledgment_status: form.acknowledgment_status,
      status: form.status,
      confidential_notes: form.confidential_notes.trim(),
    }).eq("id", selected.id);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    setMessage("Record updated. The prior version remains preserved in its revision history.");
    setShowForm(false);
    setSelected(null);
    await load();
  };

  const field = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));

  return <div className="page hr-page">
    <section className="page-header hr-header">
      <div><p className="eyebrow">Confidential employee records</p><h1>Human Resources</h1><p>Document disciplinary action securely and preserve a permanent record for each store.</p></div>
      <button className="button primary" onClick={openNew}><Plus size={18} />New disciplinary action</button>
    </section>

    <div className="hr-security-banner"><LockKeyhole size={22} /><div><strong>Restricted and permanent</strong><span>Managers see only records they submitted. Supervisors and administrators have oversight and are the only roles permitted to edit. Records cannot be deleted.</span></div></div>
    {message && <div className="form-message" role="status">{message}</div>}

    <section className="panel hr-records-panel">
      <div className="table-toolbar hr-toolbar"><div><p className="eyebrow">Disciplinary file</p><h2>{canEdit ? "Company records" : "Your submitted records"}</h2></div><div className="hr-filters"><input aria-label="Search HR records" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or incident" />{canEdit && <select aria-label="Filter by store" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option value="all">All stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{storeName(store.id)}</option>)}</select>}<select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="monitoring">Monitoring</option><option value="completed">Completed</option></select></div></div>
      {loading ? <div className="activity-empty">Opening the secure HR file…</div> : filtered.length === 0 ? <div className="activity-empty"><ShieldCheck size={30} /><strong>No disciplinary records found</strong><span>New records will appear here after they are submitted.</span></div> : <div className="responsive-table"><table className="hr-records-table"><thead><tr><th>Employee</th><th>Store</th><th>Incident</th><th>Action</th><th>Status</th><th>Submitted by</th><th>Last updated</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.id} onClick={() => void loadRevisions(record)} className={selected?.id === record.id ? "selected" : ""}><td><strong>{record.employee_name}</strong>{record.employee_identifier && <small>{record.employee_identifier}</small>}</td><td>{storeName(record.store_id)}</td><td>{formatDate(record.incident_date)}</td><td><span className={`hr-action-pill ${record.action_type}`}>{actionLabels[record.action_type]}</span></td><td><span className={`status-pill ${record.status}`}>{record.status}</span></td><td>{record.submitted_by_name}</td><td>{formatTimestamp(record.updated_at)}</td></tr>)}</tbody></table></div>}
    </section>

    {selected && !showForm && <section className="panel hr-detail-panel">
      <div className="panel-heading"><div><p className="eyebrow">Permanent record</p><h2>{selected.employee_name}</h2><p>{storeName(selected.store_id)} · Incident {formatDate(selected.incident_date)}</p></div>{canEdit && <button className="button secondary" onClick={beginEdit}><FilePenLine size={17} />Edit record</button>}</div>
      <div className="hr-record-meta"><span className={`hr-action-pill ${selected.action_type}`}>{actionLabels[selected.action_type]}</span><span className={`status-pill ${selected.status}`}>{selected.status}</span><span>{categoryLabels[selected.policy_category]}</span><span>Acknowledgment: {selected.acknowledgment_status.replace("_", " ")}</span></div>
      <div className="hr-detail-grid"><article><h3>Incident summary</h3><p>{selected.incident_summary}</p></article><article><h3>Action taken</h3><p>{selected.action_taken}</p></article><article><h3>Expectations</h3><p>{selected.expectations || "—"}</p></article><article><h3>Witnesses</h3><p>{selected.witnesses || "—"}</p></article>{selected.confidential_notes && <article className="wide"><h3>Confidential notes</h3><p>{selected.confidential_notes}</p></article>}</div>
      <div className="hr-audit"><History size={19} /><div><strong>Record history</strong><span>Submitted by {selected.submitted_by_name} on {formatTimestamp(selected.created_at)}.</span>{revisions.length === 0 ? <small>No edits have been made.</small> : revisions.map((revision) => <small key={revision.id}>Edited by {revision.changed_by_name} · {formatTimestamp(revision.created_at)}</small>)}</div></div>
    </section>}

    {showForm && <section className="panel hr-form-panel">
      <div className="panel-heading"><div><p className="eyebrow">{selected ? "Supervisor edit" : "Permanent submission"}</p><h2>{selected ? `Update ${selected.employee_name}` : "Document disciplinary action"}</h2><p>{selected ? "Saving creates an immutable revision. Store and submitter ownership cannot be changed." : "Review carefully before submitting. Managers cannot edit a record after it is saved."}</p></div><AlertTriangle size={28} /></div>
      <div className="hr-form-grid">
        <label>Store<select value={form.store_id} disabled={Boolean(selected)} onChange={(event) => field("store_id", event.target.value)}><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{storeName(store.id)}</option>)}</select></label>
        <label>Employee name<input value={form.employee_name} onChange={(event) => field("employee_name", event.target.value)} /></label>
        <label>Employee ID <small>Optional</small><input value={form.employee_identifier} onChange={(event) => field("employee_identifier", event.target.value)} /></label>
        <label>Incident date<input type="date" value={form.incident_date} onChange={(event) => field("incident_date", event.target.value)} /></label>
        <label>Action type<select value={form.action_type} onChange={(event) => field("action_type", event.target.value as ActionType)}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Policy category<select value={form.policy_category} onChange={(event) => field("policy_category", event.target.value)}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="wide">Incident summary<textarea rows={5} value={form.incident_summary} onChange={(event) => field("incident_summary", event.target.value)} placeholder="State the facts, dates, and observed behavior. Avoid assumptions." /></label>
        <label className="wide">Action taken<textarea rows={4} value={form.action_taken} onChange={(event) => field("action_taken", event.target.value)} placeholder="Describe the conversation and disciplinary action issued." /></label>
        <label className="wide">Expected correction<textarea rows={3} value={form.expectations} onChange={(event) => field("expectations", event.target.value)} placeholder="What must change, by when, and how success will be measured." /></label>
        <label>Follow-up date <small>Optional</small><input type="date" min={form.incident_date} value={form.follow_up_date} onChange={(event) => field("follow_up_date", event.target.value)} /></label>
        <label>Witnesses <small>Optional</small><input value={form.witnesses} onChange={(event) => field("witnesses", event.target.value)} /></label>
        <label>Acknowledgment<select value={form.acknowledgment_status} onChange={(event) => field("acknowledgment_status", event.target.value as Acknowledgment)}><option value="pending">Pending</option><option value="acknowledged">Acknowledged</option><option value="declined">Employee declined</option><option value="not_required">Not required</option></select></label>
        <label>Record status<select value={form.status} onChange={(event) => field("status", event.target.value as HrStatus)}><option value="open">Open</option><option value="monitoring">Monitoring</option><option value="completed">Completed</option></select></label>
        <label className="wide">Confidential supervisor notes <small>Optional</small><textarea rows={3} value={form.confidential_notes} onChange={(event) => field("confidential_notes", event.target.value)} /></label>
      </div>
      <div className="hr-form-actions"><button className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={saving} onClick={() => void (selected ? saveEdit() : submit())}><Save size={17} />{saving ? "Saving securely…" : selected ? "Save revision" : "Submit permanent record"}</button></div>
    </section>}
  </div>;
}
