import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, Plus, Trash2, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

type Area = "maintenance" | "technology";
type Store = { id: string; name: string };
type Update = { id: string; note: string; status: string | null; image_path: string | null; created_at: string; profiles?: { full_name: string } | null };
type Ticket = { id: string; severity: string; description: string; steps_taken: string; external_ticket_number: string | null; image_path: string | null; status: string; acknowledged_at: string | null; created_at: string; stores?: { name: string } | null; profiles?: { full_name: string } | null; support_ticket_updates?: Update[] };

const EMAIL_READY_IMAGE_SIZE = 4.5 * 1024 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("The picture could not be optimized.")),
    "image/jpeg",
    quality,
  ));
}

async function optimizeTicketImage(original: File) {
  if (original.size <= EMAIL_READY_IMAGE_SIZE) return original;
  const bitmap = await createImageBitmap(original);
  try {
    let scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
    let latest: Blob | null = null;
    for (const quality of [0.84, 0.74, 0.64]) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("The picture could not be optimized.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      latest = await canvasBlob(canvas, quality);
      if (latest.size <= EMAIL_READY_IMAGE_SIZE) break;
      scale *= 0.8;
    }
    if (!latest || latest.size > EMAIL_READY_IMAGE_SIZE) throw new Error("The picture is too large to store.");
    const baseName = original.name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9_-]/gi, "-") || "request-photo";
    return new File([latest], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

function ImageLink({ path }: { path: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => { supabase?.storage.from("ticket-images").createSignedUrl(path, 900).then(({ data }) => setUrl(data?.signedUrl ?? "")); }, [path]);
  return url ? <a href={url} target="_blank" rel="noreferrer">View picture</a> : <span>Preparing picture…</span>;
}

export default function SupportTickets({ profile, area }: { profile: Profile; area: Area }) {
  const [tickets, setTickets] = useState<Ticket[]>([]), [stores, setStores] = useState<Store[]>([]), [canRespond, setCanRespond] = useState(profile.role === "admin"), [showForm, setShowForm] = useState(false), [selected, setSelected] = useState<Ticket | null>(null), [message, setMessage] = useState(""), [storeId, setStoreId] = useState(""), [severity, setSeverity] = useState("green"), [description, setDescription] = useState(""), [steps, setSteps] = useState(""), [number, setNumber] = useState(""), [file, setFile] = useState<File | null>(null), [updateNote, setUpdateNote] = useState(""), [updateFile, setUpdateFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false), [updating, setUpdating] = useState(false);
  const submitInFlight = useRef(false), updateInFlight = useRef(false);
  const canDelete = profile.role === "admin" || profile.role === "accounting";
  const canSeeAll = profile.role === "supervisor" || profile.role === "accounting" || profile.role === "admin";
  const title = area === "maintenance" ? "Maintenance" : "Technology";

  const load = async () => {
    if (!supabase) return;
    let ticketQuery = supabase.from("support_tickets").select("id,severity,description,steps_taken,external_ticket_number,image_path,status,acknowledged_at,created_at,stores(name),profiles!support_tickets_submitted_by_fkey(full_name),support_ticket_updates(id,note,status,image_path,created_at,profiles!support_ticket_updates_author_id_fkey(full_name))").eq("area", area);
    if (!canSeeAll) ticketQuery = ticketQuery.eq("submitted_by", profile.id);
    const [ticketResult, storeResult, capabilityResult] = await Promise.all([
      ticketQuery.order("created_at", { ascending: false }),
      supabase.from("stores").select("id,name").eq("active", true).order("name"),
      supabase.from("profile_capabilities").select("capability").eq("profile_id", profile.id).eq("capability", area),
    ]);
    setTickets((ticketResult.data ?? []) as unknown as Ticket[]); setStores(storeResult.data ?? []);
    setCanRespond(profile.role === "admin" || (capabilityResult.data?.length ?? 0) > 0);
    if (!storeId && storeResult.data?.length) setStoreId(storeResult.data[0].id);
  };
  useEffect(() => { load(); }, [area]);

  const upload = async (uploadFile: File) => {
    const ready = await optimizeTicketImage(uploadFile);
    const path = `${profile.id}/${crypto.randomUUID()}-${ready.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const { error } = await supabase!.storage.from("ticket-images").upload(path, ready, { contentType: ready.type });
    if (error) throw error;
    return path;
  };
  const notifyResponders = async (ticketId: string, event: "submitted" | "completed") => {
    const result = await supabase!.functions.invoke("support-notifications", { body: { ticket_id: ticketId, event } });
    return !result.error && result.data?.ok === true;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true; setSubmitting(true);
    try {
      let image_path: string | null = null, photoWarning = "";
      if (file) {
        try { image_path = await upload(file); }
        catch { photoWarning = " The request was saved, but the selected photo was too large or could not be processed. You can add a smaller photo in a progress update."; }
      }
      const { data, error } = await supabase!.from("support_tickets").insert({ area, submitted_by: profile.id, store_id: storeId, severity, description, steps_taken: steps, external_ticket_number: number || null, image_path }).select("id").single();
      if (error || !data) throw error ?? new Error("Request could not be saved.");
      // The request is now safely stored. Close the form immediately instead
      // of making the manager wait for Gmail delivery to finish.
      setShowForm(false); setDescription(""); setSteps(""); setNumber(""); setFile(null);
      setMessage("Request submitted. Notifying responders…");
      window.dispatchEvent(new Event("dashos:requests-changed")); void load();
      const notified = await notifyResponders(data.id, "submitted");
      setMessage((notified ? "Request submitted. Responders were notified." : "Request submitted, but the responder email could not be sent.") + photoWarning);
    } catch (error: any) { setMessage(error.message); }
    finally { submitInFlight.current = false; setSubmitting(false); }
  };
  const update = async (status: string) => {
    if (!selected || updateInFlight.current) return;
    updateInFlight.current = true; setUpdating(true);
    try { const ticketId = selected.id, now = new Date().toISOString(); let image_path: string | null = null, photoWarning = ""; if (updateFile) { try { image_path = await upload(updateFile); } catch { photoWarning = " The update was saved without the photo because it was too large or could not be processed."; } } const patch: any = { status, updated_at: now }; if (status === "viewed" && !selected.acknowledged_at) { patch.acknowledged_at = now; patch.acknowledged_by = profile.id; } if (status === "completed") patch.completed_at = now; const { error } = await supabase!.from("support_tickets").update(patch).eq("id", ticketId); if (error) throw error; const { error: updateError } = await supabase!.from("support_ticket_updates").insert({ ticket_id: ticketId, author_id: profile.id, status, note: updateNote, image_path }); if (updateError) throw updateError; setSelected(null); setUpdateNote(""); setUpdateFile(null); setMessage((status === "completed" ? "Request completed. Notifying responders…" : "Ticket updated.") + photoWarning); window.dispatchEvent(new Event("dashos:requests-changed")); void load(); const notified = status !== "completed" || await notifyResponders(ticketId, "completed"); if (status === "completed") setMessage((notified ? "Request completed. Responders were notified." : "Request completed, but the responder email could not be sent.") + photoWarning); } catch (error: any) { setMessage(error.message); }
    finally { updateInFlight.current = false; setUpdating(false); }
  };
  const remove = async () => { if (!supabase || !selected || !canDelete) return; if (!window.confirm("Permanently delete this support request and its progress history? This cannot be undone.")) return; const deleted = selected, paths = [deleted.image_path, ...(deleted.support_ticket_updates ?? []).map((entry) => entry.image_path)].filter((path): path is string => Boolean(path)); const { error } = await supabase.from("support_tickets").delete().eq("id", deleted.id); if (error) { setMessage(error.message); return; } if (paths.length) await supabase.storage.from("ticket-images").remove(paths); setSelected(null); setMessage(`${title} request deleted.`); load(); };

  return <div className="page"><div className="page-heading heading-with-action"><div><p className="eyebrow">{canSeeAll?"Store support":"My support history"}</p><h1>{canSeeAll?`${title} requests.`:`My ${title.toLowerCase()} requests.`}</h1><p>{canSeeAll?"Review submitted problems and follow their progress through completion.":"Submit a problem and follow the progress of requests you submitted."}</p></div><button className="button primary" onClick={() => setShowForm(true)}><Plus /> New request</button></div>{message && <p className="inline-message">{message}</p>}<div className="ticket-grid">{tickets.map((ticket) => <button className={`ticket-card severity-${ticket.severity}`} key={ticket.id} onClick={() => setSelected(ticket)}><span className="severity-dot"/><div><small>{ticket.stores?.name} · {new Date(ticket.created_at).toLocaleString()}</small><strong>{ticket.description}</strong><span>Submitted by {ticket.profiles?.full_name}</span></div><span className="ticket-status">{ticket.status.replaceAll("_", " ")}</span></button>)}</div>
  {showForm && <div className="modal-backdrop" onClick={() => { if (!submitting) setShowForm(false); }}><form className="ticket-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" disabled={submitting} onClick={() => setShowForm(false)}><X /></button><h2>New {title.toLowerCase()} request</h2><label>Store<select required disabled={submitting} value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label><label>Severity<select disabled={submitting} value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="green">Green — Mild inconvenience</option><option value="yellow">Yellow — Operational with workaround</option><option value="red">Red — Store is not operational</option></select></label><label>Problem description<textarea required disabled={submitting} rows={4} value={description} onChange={(event) => setDescription(event.target.value)}/></label><label>Steps already taken<textarea disabled={submitting} rows={3} value={steps} onChange={(event) => setSteps(event.target.value)}/></label><label>Related ticket number<input disabled={submitting} value={number} onChange={(event) => setNumber(event.target.value)}/></label><label>Picture<input disabled={submitting} type="file" accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label><button className="button primary full" disabled={submitting}>{submitting ? "Submitting…" : "Submit request"}</button></form></div>}
  {selected && <div className="modal-backdrop" onClick={() => { if (!updating) setSelected(null); }}><section className="ticket-modal ticket-detail" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" disabled={updating} onClick={() => setSelected(null)}><X /></button><p className="eyebrow">{selected.stores?.name} · {selected.severity}</p><h2>{selected.description}</h2><dl><div><dt>Status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div><div><dt>Acknowledged</dt><dd>{selected.acknowledged_at ? new Date(selected.acknowledged_at).toLocaleString() : "Not yet"}</dd></div><div><dt>Steps taken</dt><dd>{selected.steps_taken || "None"}</dd></div><div><dt>Ticket number</dt><dd>{selected.external_ticket_number || "None"}</dd></div></dl>{selected.image_path && <ImageLink path={selected.image_path}/>}<h3>Progress notes</h3>{selected.support_ticket_updates?.map((entry) => <div className="ticket-update" key={entry.id}><strong>{entry.status?.replaceAll("_", " ")}</strong><p>{entry.note || "No note"}</p>{entry.image_path && <ImageLink path={entry.image_path}/>}<small>{entry.profiles?.full_name} · {new Date(entry.created_at).toLocaleString()}</small></div>)}{canRespond && <div className="responder-box"><h3>Responder update</h3><label>Notes<textarea disabled={updating} rows={3} value={updateNote} onChange={(event) => setUpdateNote(event.target.value)}/></label><label>Picture<input disabled={updating} type="file" accept="image/*" onChange={(event) => setUpdateFile(event.target.files?.[0] ?? null)}/></label><div className="button-row"><button className="button secondary" disabled={updating} onClick={() => update("viewed")}><Eye /> Viewed</button><button className="button secondary" disabled={updating} onClick={() => update("in_progress")}><AlertTriangle /> In progress</button><button className="button primary" disabled={updating} onClick={() => update("completed")}><CheckCircle2 /> {updating ? "Saving…" : "Completed"}</button></div></div>}{canDelete && <div className="request-admin-actions"><button className="button secondary danger" disabled={updating} onClick={remove}><Trash2 size={17}/> Delete request</button></div>}</section></div>}</div>;
}
