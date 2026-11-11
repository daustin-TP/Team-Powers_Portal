import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, FilePenLine, History, LockKeyhole, Mail, Plus, Printer, Save, ShieldCheck, UserRound } from "lucide-react";
import { openHrRecordPdf } from "../lib/hrRecordPdf";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type Store = { id: string; name: string; store_number: string | null };
type ActionType = "coaching" | "verbal_warning" | "written_warning" | "final_warning" | "suspension" | "termination";
type HrStatus = "open" | "monitoring" | "completed";
type Acknowledgment = "pending" | "acknowledged" | "declined" | "not_required";
type EmploymentStatus = "active" | "on_leave" | "borrowed" | "terminated" | "archived";
type TeamMember = { id: string; store_id: string; display_name: string; employment_status: EmploymentStatus; created_at: string };
type StatusHistory = { id: string; member_id: string; store_id: string; from_status: EmploymentStatus | null; to_status: EmploymentStatus; effective_date: string; changed_at: string };
type HrNotificationSettings = { delivery_mode: "test" | "live"; test_recipients: string[]; live_recipients: string[] };

type DisciplinaryAction = {
  id: string;
  store_id: string;
  employee_name: string;
  employee_identifier: string | null;
  member_id: string | null;
  incident_date: string;
  action_type: ActionType;
  policy_categories: string[];
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
  member_id: string;
  incident_date: string;
  action_type: ActionType;
  policy_categories: string[];
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
  member_id: "",
  incident_date: today(),
  action_type: "coaching",
  policy_categories: ["other"],
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
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistory[]>([]);
  const [notificationSettings, setNotificationSettings] = useState<HrNotificationSettings | null>(null);
  const [turnoverStart, setTurnoverStart] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [turnoverEnd, setTurnoverEnd] = useState(today);
  const [turnoverStore, setTurnoverStore] = useState("all");
  const [selected, setSelected] = useState<DisciplinaryAction | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(profile.storeId ?? ""));
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printingRecord, setPrintingRecord] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setMessage("");
    const [storeResult, recordResult, assignmentResult, memberResult, historyResult, settingsResult] = await Promise.all([
      supabase.from("stores").select("id,name,store_number").eq("active", true).order("name"),
      supabase.from("hr_disciplinary_actions").select("*").order("incident_date", { ascending: false }).order("created_at", { ascending: false }),
      profile.role === "manager"
        ? supabase.from("profile_store_assignments").select("store_id").eq("profile_id", profile.id)
        : Promise.resolve({ data: null, error: null }),
      profile.role === "supervisor" || profile.role === "admin"
        ? supabase.from("labor_team_members").select("id,store_id,display_name,employment_status,created_at").order("display_name")
        : supabase.from("labor_team_members").select("id,store_id,display_name,employment_status,created_at").eq("active", true).order("display_name"),
      profile.role === "supervisor" || profile.role === "admin"
        ? supabase.from("team_member_status_history").select("id,member_id,store_id,from_status,to_status,effective_date,changed_at").order("effective_date")
        : Promise.resolve({ data: [], error: null }),
      profile.role === "admin"
        ? supabase.from("hr_notification_settings").select("delivery_mode,test_recipients,live_recipients").eq("id", true).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (storeResult.error || recordResult.error || memberResult.error || historyResult.error || settingsResult.error) {
      setMessage(storeResult.error?.message || recordResult.error?.message || memberResult.error?.message || historyResult.error?.message || settingsResult.error?.message || "The confidential HR file could not be loaded.");
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
    setMembers(((memberResult.data ?? []) as TeamMember[]).filter((member) => visibleStores.some((store) => store.id === member.store_id)));
    setStatusHistory((historyResult.data ?? []) as StatusHistory[]);
    setNotificationSettings((settingsResult.data as HrNotificationSettings | null) ?? null);
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
    if (form.action_type === "termination" && !form.member_id) {
      setMessage("Select the roster employee before submitting a termination report.");
      return;
    }
    if (!form.store_id || !form.employee_name.trim() || form.incident_summary.trim().length < 10 || form.action_taken.trim().length < 5) {
      setMessage("Complete the store, employee, incident summary, and action taken before saving.");
      return;
    }
    setSaving(true);
    setMessage("");
    const { data: savedRecord, error } = await supabase.from("hr_disciplinary_actions").insert({
      store_id: form.store_id,
      employee_name: form.employee_name.trim(),
      employee_identifier: form.employee_identifier.trim() || null,
      member_id: form.member_id || null,
      incident_date: form.incident_date,
      action_type: form.action_type,
      policy_categories: form.policy_categories,
      incident_summary: form.incident_summary.trim(),
      action_taken: form.action_taken.trim(),
      expectations: form.expectations.trim(),
      follow_up_date: form.follow_up_date || null,
      witnesses: form.witnesses.trim(),
      confidential_notes: form.confidential_notes.trim(),
      acknowledgment_status: form.acknowledgment_status,
      status: form.status,
      submitted_by: profile.id,
      submitted_by_name: profile.fullName,
    }).select("id").single();
    if (error) { setSaving(false); setMessage(error.message); return; }
    let completionMessage = "Disciplinary action saved to the permanent confidential file.";
    if (form.action_type === "termination" && savedRecord && form.member_id) {
      const notification = await supabase.functions.invoke("termination-notifications", { body: { action_id: savedRecord.id, member_id: form.member_id } });
      if (notification.error) completionMessage = "Termination report saved. The roster or test email needs administrator review.";
      else if (notification.data?.warning) completionMessage = `Termination recorded and removed from the active roster. ${notification.data.warning}`;
      else completionMessage = `Termination recorded and removed from the active roster. ${notification.data?.sent ?? 0} test HR email${notification.data?.sent === 1 ? "" : "s"} sent.`;
    }
    setSaving(false);
    setMessage(completionMessage);
    setShowForm(false);
    await load();
  };

  const beginEdit = () => {
    if (!selected || !canEdit) return;
    setForm({
      store_id: selected.store_id,
      employee_name: selected.employee_name,
      employee_identifier: selected.employee_identifier ?? "",
      member_id: selected.member_id ?? "",
      incident_date: selected.incident_date,
      action_type: selected.action_type,
      policy_categories: selected.policy_categories,
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
      member_id: form.member_id || null,
      incident_date: form.incident_date,
      action_type: form.action_type,
      policy_categories: form.policy_categories,
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

  const selectRosterMember = (memberId: string) => {
    const member = members.find((item) => item.id === memberId);
    setForm((current) => ({ ...current, member_id: memberId, employee_name: member?.display_name ?? current.employee_name }));
  };

  const statusAt = (member: TeamMember, date: string) => {
    const events = statusHistory
      .filter((event) => event.member_id === member.id && event.effective_date <= date)
      .sort((left, right) => left.effective_date.localeCompare(right.effective_date) || left.changed_at.localeCompare(right.changed_at));
    return events.at(-1)?.to_status ?? (member.created_at.slice(0, 10) <= date ? member.employment_status : null);
  };

  const allTurnoverRows = useMemo(() => stores.map((store) => {
    const storeMembers = members.filter((member) => member.store_id === store.id && member.created_at.slice(0, 10) <= turnoverEnd);
    const included = (status: EmploymentStatus | null) => status === "active" || status === "on_leave";
    const opening = storeMembers.filter((member) => included(statusAt(member, turnoverStart))).length;
    const closing = storeMembers.filter((member) => included(statusAt(member, turnoverEnd))).length;
    const terminations = statusHistory.filter((event) => event.store_id === store.id && event.to_status === "terminated" && event.effective_date >= turnoverStart && event.effective_date <= turnoverEnd).length;
    const averageHeadcount = (opening + closing) / 2;
    return { store, opening, closing, terminations, rate: averageHeadcount > 0 ? terminations / averageHeadcount * 100 : 0 };
  }).sort((left, right) => right.rate - left.rate), [members, statusHistory, stores, turnoverEnd, turnoverStart]);

  const turnoverRows = useMemo(() => allTurnoverRows.filter((row) => turnoverStore === "all" || row.store.id === turnoverStore), [allTurnoverRows, turnoverStore]);

  const companyTurnover = useMemo(() => {
    const opening = allTurnoverRows.reduce((sum, row) => sum + row.opening, 0);
    const closing = allTurnoverRows.reduce((sum, row) => sum + row.closing, 0);
    const terminations = allTurnoverRows.reduce((sum, row) => sum + row.terminations, 0);
    return { opening, closing, terminations, rate: opening + closing > 0 ? terminations / ((opening + closing) / 2) * 100 : 0 };
  }, [allTurnoverRows]);

  const saveNotificationSettings = async () => {
    if (!supabase || profile.role !== "admin" || !notificationSettings) return;
    setSaving(true); setMessage("");
    const recipients = notificationSettings.test_recipients.map((email) => email.trim().toLowerCase()).filter(Boolean);
    const { error } = await supabase.from("hr_notification_settings").update({ test_recipients: recipients, delivery_mode: "test", updated_by: profile.id, updated_at: new Date().toISOString() }).eq("id", true);
    setSaving(false);
    setNotificationSettings({ ...notificationSettings, delivery_mode: "test", test_recipients: recipients });
    setMessage(error ? error.message : "Test termination recipients saved. The outside HR provider is still disabled.");
  };

  const togglePolicyCategory = (category: string) => {
    if (category === "other") {
      field("policy_categories", ["other"]);
      return;
    }
    const selectedCategories = form.policy_categories.filter((value) => value !== "other");
    const nextCategories = selectedCategories.includes(category)
      ? selectedCategories.filter((value) => value !== category)
      : [...selectedCategories, category];
    field("policy_categories", nextCategories.length > 0 ? nextCategories : ["other"]);
  };

  const printRecord = async () => {
    if (!selected || printingRecord) return;
    setPrintingRecord(true);
    setMessage("");
    try {
      await openHrRecordPdf({
        id: selected.id,
        employeeName: selected.employee_name,
        employeeIdentifier: selected.employee_identifier ?? "",
        storeName: storeName(selected.store_id),
        incidentDate: formatDate(selected.incident_date),
        actionType: selected.action_type,
        policyCategories: selected.policy_categories,
        incidentSummary: selected.incident_summary,
        actionTaken: selected.action_taken,
        expectations: selected.expectations,
        followUpDate: selected.follow_up_date ? formatDate(selected.follow_up_date) : "",
        witnesses: selected.witnesses,
        acknowledgmentStatus: selected.acknowledgment_status,
        status: selected.status,
        submittedByName: selected.submitted_by_name,
      });
      setMessage("Two-page portrait PDF created. It is ready to review and print.");
    } catch (error) {
      setMessage(`The HR record PDF could not be created: ${(error as Error).message}`);
    } finally {
      setPrintingRecord(false);
    }
  };

  return <div className="page hr-page">
    <section className="page-header hr-header">
      <div><p className="eyebrow">Confidential employee records</p><h1>HR Action Logs</h1><p>Document disciplinary action securely and preserve a permanent record for each store.</p></div>
      <div className="button-row">
        <a className="button secondary" href="/forms/Team_Powers_Employee_Corrective_Action_Form.pdf" target="_blank" rel="noreferrer"><Printer size={18} />Print blank form</a>
        <button className="button primary" onClick={openNew}><Plus size={18} />New disciplinary action</button>
      </div>
    </section>

    <div className="hr-security-banner"><LockKeyhole size={22} /><div><strong>Restricted and permanent</strong><span>Managers see only records they submitted. District Managers and administrators have oversight and are the only roles permitted to edit. Records cannot be deleted.</span></div></div>
    {message && <div className="form-message" role="status">{message}</div>}

    <section className="panel hr-records-panel">
      <div className="table-toolbar hr-toolbar"><div><p className="eyebrow">Disciplinary file</p><h2>{canEdit ? "Company records" : "Your submitted records"}</h2></div><div className="hr-filters"><input aria-label="Search HR records" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search employee or incident" />{canEdit && <select aria-label="Filter by store" value={storeFilter} onChange={(event) => setStoreFilter(event.target.value)}><option value="all">All stores</option>{stores.map((store) => <option key={store.id} value={store.id}>{storeName(store.id)}</option>)}</select>}<select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="monitoring">Monitoring</option><option value="completed">Completed</option></select></div></div>
      {loading ? <div className="activity-empty">Opening the secure HR file…</div> : filtered.length === 0 ? <div className="activity-empty"><ShieldCheck size={30} /><strong>No disciplinary records found</strong><span>New records will appear here after they are submitted.</span></div> : <div className="responsive-table"><table className="hr-records-table"><thead><tr><th>Employee</th><th>Store</th><th>Incident</th><th>Action</th><th>Status</th><th>Submitted by</th><th>Last updated</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.id} onClick={() => void loadRevisions(record)} className={selected?.id === record.id ? "selected" : ""}><td><strong>{record.employee_name}</strong>{record.employee_identifier && <small>{record.employee_identifier}</small>}</td><td>{storeName(record.store_id)}</td><td>{formatDate(record.incident_date)}</td><td><span className={`hr-action-pill ${record.action_type}`}>{actionLabels[record.action_type]}</span></td><td><span className={`status-pill ${record.status}`}>{record.status}</span></td><td>{record.submitted_by_name}</td><td>{formatTimestamp(record.updated_at)}</td></tr>)}</tbody></table></div>}
    </section>

    {canEdit && <section className="panel hr-turnover-panel">
      <div className="table-toolbar"><div><p className="eyebrow">Store health · DASH-recorded history</p><h2><BarChart3 size={21} /> Turnover</h2><p>Separations divided by average opening and closing headcount. Borrowed employees are excluded from the receiving store’s headcount.</p></div><div className="hr-filters"><label>From<input type="date" value={turnoverStart} onChange={(event) => setTurnoverStart(event.target.value)} /></label><label>Through<input type="date" value={turnoverEnd} onChange={(event) => setTurnoverEnd(event.target.value)} /></label><select aria-label="Turnover store" value={turnoverStore} onChange={(event) => setTurnoverStore(event.target.value)}><option value="all">Whole company</option>{stores.map((store) => <option key={store.id} value={store.id}>{storeName(store.id)}</option>)}</select></div></div>
      <div className="turnover-summary"><article><span>Company turnover</span><strong>{companyTurnover.rate.toFixed(1)}%</strong></article><article><span>Recorded terminations</span><strong>{companyTurnover.terminations}</strong></article><article><span>Average headcount</span><strong>{((companyTurnover.opening + companyTurnover.closing) / 2).toFixed(1)}</strong></article></div>
      <div className="responsive-table"><table><thead><tr><th>Rank</th><th>Store</th><th>Opening</th><th>Closing</th><th>Terminations</th><th>Turnover</th><th>vs. company</th></tr></thead><tbody>{turnoverRows.map((row) => <tr key={row.store.id}><td>{allTurnoverRows.findIndex((candidate) => candidate.store.id === row.store.id) + 1}</td><td><strong>{storeName(row.store.id)}</strong></td><td>{row.opening}</td><td>{row.closing}</td><td>{row.terminations}</td><td><strong>{row.rate.toFixed(1)}%</strong></td><td>{row.rate > companyTurnover.rate ? `${(row.rate - companyTurnover.rate).toFixed(1)} pts above` : `${(companyTurnover.rate - row.rate).toFixed(1)} pts below`}</td></tr>)}</tbody></table></div>
      <small className="data-note">This report begins with the DASH roster baseline. It will become more meaningful as status history accumulates; legacy inactive records are not counted as terminations.</small>
    </section>}

    {profile.role === "admin" && notificationSettings && <section className="panel hr-notification-settings">
      <div className="panel-heading"><div><p className="eyebrow">Termination delivery settings</p><h2><Mail size={21} /> HR notification testing</h2><p>Only the test recipients below receive termination alerts. teampowershr@outlook.com remains disabled until you approve going live.</p></div><span className="status-pill monitoring">TEST MODE</span></div>
      <label>Test recipient emails <small>Separate multiple addresses with commas</small><textarea rows={2} value={notificationSettings.test_recipients.join(", ")} onChange={(event) => setNotificationSettings({ ...notificationSettings, test_recipients: event.target.value.split(",") })} /></label>
      <div className="hr-form-actions"><button className="button secondary" disabled={saving} onClick={() => void saveNotificationSettings()}><Save size={17} />Save test recipients</button></div>
    </section>}

    {selected && !showForm && <section className="panel hr-detail-panel">
      <div className="panel-heading"><div><p className="eyebrow">Permanent record</p><h2>{selected.employee_name}</h2><p>{storeName(selected.store_id)} · Incident {formatDate(selected.incident_date)}</p></div><div className="button-row"><button className="button secondary" disabled={printingRecord} onClick={() => void printRecord()}><Printer size={17} />{printingRecord ? "Preparing PDF…" : "Print record"}</button>{canEdit && <button className="button secondary" onClick={beginEdit}><FilePenLine size={17} />Edit record</button>}</div></div>
      <div className="hr-record-meta"><span className={`hr-action-pill ${selected.action_type}`}>{actionLabels[selected.action_type]}</span><span className={`status-pill ${selected.status}`}>{selected.status}</span><span>{selected.policy_categories.map((category) => categoryLabels[category] ?? category).join(" · ")}</span><span>Acknowledgment: {selected.acknowledgment_status.replace("_", " ")}</span></div>
      <div className="hr-detail-grid"><article><h3>Incident summary</h3><p>{selected.incident_summary}</p></article><article><h3>Action taken</h3><p>{selected.action_taken}</p></article><article><h3>Expectations</h3><p>{selected.expectations || "—"}</p></article><article><h3>Witnesses</h3><p>{selected.witnesses || "—"}</p></article>{selected.confidential_notes && <article className="wide"><h3>Confidential notes</h3><p>{selected.confidential_notes}</p></article>}</div>
      <div className="hr-audit"><History size={19} /><div><strong>Record history</strong><span>Submitted by {selected.submitted_by_name} on {formatTimestamp(selected.created_at)}.</span>{revisions.length === 0 ? <small>No edits have been made.</small> : revisions.map((revision) => <small key={revision.id}>Edited by {revision.changed_by_name} · {formatTimestamp(revision.created_at)}</small>)}</div></div>
    </section>}

    {showForm && <section className="panel hr-form-panel">
      <div className="panel-heading"><div><p className="eyebrow">{selected ? "District Manager edit" : "Permanent submission"}</p><h2>{selected ? `Update ${selected.employee_name}` : "Document disciplinary action"}</h2><p>{selected ? "Saving creates an immutable revision. Store and submitter ownership cannot be changed." : "Review carefully before submitting. Managers cannot edit a record after it is saved."}</p></div><AlertTriangle size={28} /></div>
      <div className="hr-form-grid">
        <label>Store<select value={form.store_id} disabled={Boolean(selected)} onChange={(event) => field("store_id", event.target.value)}><option value="">Select store</option>{stores.map((store) => <option key={store.id} value={store.id}>{storeName(store.id)}</option>)}</select></label>
        <label>Roster employee <small>{form.action_type === "termination" ? "Required for termination" : "Recommended"}</small><select value={form.member_id} onChange={(event) => selectRosterMember(event.target.value)}><option value="">Enter name manually</option>{members.filter((member) => member.store_id === form.store_id && member.employment_status !== "terminated" && member.employment_status !== "archived").map((member) => <option key={member.id} value={member.id}>{member.display_name}{member.employment_status !== "active" ? ` · ${member.employment_status.replace("_", " ")}` : ""}</option>)}</select></label>
        <label>Employee name<input value={form.employee_name} readOnly={Boolean(form.member_id)} onChange={(event) => field("employee_name", event.target.value)} /></label>
        <label>Employee ID <small>Optional</small><input value={form.employee_identifier} onChange={(event) => field("employee_identifier", event.target.value)} /></label>
        <label>Incident date<input type="date" value={form.incident_date} onChange={(event) => field("incident_date", event.target.value)} /></label>
        <label>Action type<select value={form.action_type} onChange={(event) => field("action_type", event.target.value as ActionType)}>{Object.entries(actionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{form.action_type === "termination" && <small>Submitting will remove this employee from active scheduling and send a test-only HR alert.</small>}</label>
        <fieldset className="wide hr-category-selector"><legend>Policy categories <small>Select all that apply</small></legend><div>{Object.entries(categoryLabels).map(([value, label]) => <label key={value} className={form.policy_categories.includes(value) ? "selected" : ""}><input type="checkbox" checked={form.policy_categories.includes(value)} onChange={() => togglePolicyCategory(value)} /><span>{label}</span></label>)}</div></fieldset>
        <label className="wide">Incident summary<textarea rows={5} value={form.incident_summary} onChange={(event) => field("incident_summary", event.target.value)} placeholder="State the facts, dates, and observed behavior. Avoid assumptions." /></label>
        <label className="wide">Action taken<textarea rows={4} value={form.action_taken} onChange={(event) => field("action_taken", event.target.value)} placeholder="Describe the conversation and disciplinary action issued." /></label>
        <label className="wide">Expected correction<textarea rows={3} value={form.expectations} onChange={(event) => field("expectations", event.target.value)} placeholder="What must change, by when, and how success will be measured." /></label>
        <label>Follow-up date <small>Optional</small><input type="date" min={form.incident_date} value={form.follow_up_date} onChange={(event) => field("follow_up_date", event.target.value)} /></label>
        <label>Witnesses <small>Optional</small><input value={form.witnesses} onChange={(event) => field("witnesses", event.target.value)} /></label>
        <label>Acknowledgment<select value={form.acknowledgment_status} onChange={(event) => field("acknowledgment_status", event.target.value as Acknowledgment)}><option value="pending">Pending</option><option value="acknowledged">Acknowledged</option><option value="declined">Employee declined</option><option value="not_required">Not required</option></select></label>
        <label>Record status<select value={form.status} onChange={(event) => field("status", event.target.value as HrStatus)}><option value="open">Open</option><option value="monitoring">Monitoring</option><option value="completed">Completed</option></select></label>
        <label className="wide">Confidential District Manager notes <small>Optional</small><textarea rows={3} value={form.confidential_notes} onChange={(event) => field("confidential_notes", event.target.value)} /></label>
      </div>
      <div className="hr-form-actions"><button className="button secondary" onClick={() => setShowForm(false)}>Cancel</button><button className="button primary" disabled={saving} onClick={() => void (selected ? saveEdit() : submit())}><Save size={17} />{saving ? "Saving securely…" : selected ? "Save revision" : "Submit permanent record"}</button></div>
    </section>}

  </div>;
}
