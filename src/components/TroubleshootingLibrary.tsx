import { FormEvent, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Pencil, Plus, Save, Search, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

const issueGroups = [
  { name: "Internet & Network", description: "Internet outages, slow connections, and network interruptions" },
  { name: "Computers & POS", description: "Store computers, order entry, dispatch, and system performance" },
  { name: "Card Payments", description: "Customer-facing and manual-entry payment problems" },
  { name: "Printers", description: "Receipt, office, cut-table, and dispatch printing" },
  { name: "Phones & Caller ID", description: "Store phones and caller identification" },
  { name: "Screens & Touchscreens", description: "Monitors, televisions, and touch response" },
  { name: "Security Cameras", description: "Camera feeds, recording, and display issues" },
  { name: "Software & Accounts", description: "Logins, applications, permissions, and updates" },
  { name: "Other / Not Sure", description: "Problems that do not clearly fit another group" },
] as const;

type IssueGroup = typeof issueGroups[number]["name"];
type Guide = { id: string; issue_category: string; title: string; overview: string; steps: string[]; active: boolean };
type Draft = { issueCategory: IssueGroup; title: string; overview: string; stepsText: string };
const emptyDraft: Draft = { issueCategory: "Internet & Network", title: "", overview: "", stepsText: "" };

export default function TroubleshootingLibrary({ profile, canRespond }: { profile: Profile; canRespond: boolean }) {
  const [group, setGroup] = useState<IssueGroup>("Internet & Network");
  const [search, setSearch] = useState("");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const canManage = profile.role === "admin" || canRespond;
  const selectedGroup = issueGroups.find((item) => item.name === group) ?? issueGroups[0];
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return guides.filter((guide) => guide.active && guide.issue_category === group && (!query || [guide.title, guide.overview, ...guide.steps].some((value) => value.toLowerCase().includes(query))));
  }, [group, guides, search]);

  const load = async () => {
    if (!supabase) return;
    setLoading(true);
    const { data, error } = await supabase.from("technology_troubleshooting_guides").select("id,issue_category,title,overview,steps,active").eq("active", true).order("issue_category").order("title");
    if (error) setMessage(error.message); else setGuides((data ?? []) as Guide[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const edit = (guide: Guide) => {
    const issueCategory = issueGroups.some((item) => item.name === guide.issue_category) ? guide.issue_category as IssueGroup : "Other / Not Sure";
    setDraft({ issueCategory, title: guide.title, overview: guide.overview, stepsText: guide.steps.join("\n") });
    setEditing(guide.id);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || !editing || saving) return;
    const steps = draft.stepsText.split("\n").map((step) => step.trim()).filter(Boolean);
    if (!steps.length) { setMessage("Add at least one resolution step."); return; }
    setSaving(true); setMessage("");
    const payload = { issue_category: draft.issueCategory, title: draft.title.trim(), overview: draft.overview.trim(), steps, updated_by: profile.id };
    const result = editing === "new"
      ? await supabase.from("technology_troubleshooting_guides").insert({ ...payload, created_by: profile.id })
      : await supabase.from("technology_troubleshooting_guides").update(payload).eq("id", editing);
    if (result.error) setMessage(result.error.code === "23505" ? "That common issue already exists in this group." : result.error.message);
    else {
      setEditing(null); setGroup(draft.issueCategory); setSearch("");
      setMessage(editing === "new" ? "Troubleshooting issue added." : "Troubleshooting issue updated.");
      await load();
    }
    setSaving(false);
  };

  return <section className="troubleshooting-library issue-first-library">
    <div className="troubleshooting-sidebar panel">
      <p className="eyebrow">Common store issues</p><h2>Troubleshooting</h2><p>Start with what is happening, not the piece of equipment.</p>
      <div className="troubleshooting-types">{issueGroups.map((item) => <button type="button" key={item.name} className={group === item.name ? "active" : ""} onClick={() => { setGroup(item.name); setSearch(""); }}><span className="issue-group-copy"><strong>{item.name}</strong><small>{item.description}</small></span><span className="issue-count">{guides.filter((guide) => guide.issue_category === item.name && guide.active).length}</span></button>)}</div>
    </div>
    <div className="troubleshooting-content">
      <div className="table-toolbar troubleshooting-heading"><div><p className="eyebrow">Issue-to-resolution guide</p><h2>{group}</h2><p>{selectedGroup.description}. Choose the closest issue below.</p></div><div className="troubleshooting-actions"><label className="search-field"><span className="sr-only">Search this issue group</span><Search size={17}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this group"/></label>{canManage && <button className="button primary" onClick={() => { setDraft({ ...emptyDraft, issueCategory: group }); setEditing("new"); }}><Plus size={17}/>Add common issue</button>}</div></div>
      {message && <p className="inline-message">{message}</p>}
      {loading ? <div className="activity-empty">Opening troubleshooting guides…</div> : visible.length === 0 ? <div className="equipment-empty"><BookOpenCheck size={30}/><strong>{search ? "No matching issue was found" : `No common issues have been added for ${group}`}</strong><span>{search ? "Try a different phrase or select another issue group." : "You can still submit a technology request for help."}</span></div> : <div className="troubleshooting-guide-list">{visible.map((guide) => <article key={guide.id}><header><div><p className="eyebrow">Common issue</p><h3>{guide.title}</h3>{guide.overview && <p>{guide.overview}</p>}</div>{canManage && <button className="icon-button" aria-label={`Edit ${guide.title}`} onClick={() => edit(guide)}><Pencil size={17}/></button>}</header><div className="resolution-heading">Resolution steps</div><ol>{guide.steps.map((step, index) => <li key={`${guide.id}-${index}`}>{step}</li>)}</ol></article>)}</div>}
    </div>
    {editing && <div className="modal-backdrop" onClick={() => { if (!saving) setEditing(null); }}><form className="ticket-modal troubleshooting-editor" onSubmit={save} onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" disabled={saving} onClick={() => setEditing(null)}><X/></button><p className="eyebrow">Troubleshooting library</p><h2>{editing === "new" ? "Add a common issue" : "Update common issue"}</h2><label>Issue group<select value={draft.issueCategory} onChange={(event) => setDraft({ ...draft, issueCategory: event.target.value as IssueGroup })}>{issueGroups.map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>What is happening?<input required minLength={3} maxLength={160} placeholder="Example: Internet is down at the entire store" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label><label>How to recognize this issue<textarea rows={3} maxLength={2000} placeholder="Describe the symptoms so the store can confirm this is the right guide." value={draft.overview} onChange={(event) => setDraft({ ...draft, overview: event.target.value })}/></label><label>Resolution steps <small>(one step per line)</small><textarea required rows={10} placeholder={'Confirm whether every computer is affected\nCheck the status lights and connections\nRecord what changed before moving to the next step'} value={draft.stepsText} onChange={(event) => setDraft({ ...draft, stepsText: event.target.value })}/></label><button className="button primary full" disabled={saving}><Save size={17}/>{saving ? "Saving…" : "Save issue guide"}</button></form></div>}
  </section>;
}
