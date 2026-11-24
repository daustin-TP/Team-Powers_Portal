import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, BookOpenCheck, CheckCircle2, Eye, MonitorCog, Plus, Trash2, Wrench, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { technologyEquipmentTypes, type TechnologyEquipmentType } from "../lib/technologyEquipment";
import type { Profile } from "../types";
import EquipmentInventory from "./EquipmentInventory";
import TechnologyEquipment from "./TechnologyEquipment";
import TroubleshootingLibrary from "./TroubleshootingLibrary";

type Area = "maintenance" | "technology";
type Store = { id: string; name: string };
type Update = { id: string; note: string; status: string | null; image_path: string | null; image_paths: string[] | null; created_at: string; profiles?: { full_name: string } | null };
type Ticket = { id: string; severity: string; description: string; steps_taken: string; external_ticket_number: string | null; image_path: string | null; image_paths: string[] | null; status: string; acknowledged_at: string | null; created_at: string; technology_equipment_type: TechnologyEquipmentType | null; technology_equipment_id: string | null; technology_equipment?: { label: string } | null; stores?: { name: string } | null; profiles?: { full_name: string } | null; support_ticket_updates?: Update[] };
type TechnologyDevice = { id: string; equipment_type: TechnologyEquipmentType; label: string };
type SupportSubpage = "requests" | "maintenance-equipment" | "technology-equipment" | "troubleshooting";

const EMAIL_READY_IMAGE_SIZE = 4.5 * 1024 * 1024;
const MAX_REQUEST_PHOTOS = 6;

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

function PhotoLinks({ paths }: { paths: (string | null | undefined)[] }) {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  if (!unique.length) return null;
  return <div className="ticket-photo-links"><strong>{unique.length === 1 ? "Picture" : `${unique.length} pictures`}</strong>{unique.map((path, index) => <ImageLink key={path} path={path}/>)}</div>;
}

export default function SupportTickets({ profile, area }: { profile: Profile; area: Area }) {
  const [tickets, setTickets] = useState<Ticket[]>([]), [stores, setStores] = useState<Store[]>([]), [canRespond, setCanRespond] = useState(profile.role === "admin"), [showForm, setShowForm] = useState(false), [selected, setSelected] = useState<Ticket | null>(null), [message, setMessage] = useState(""), [formMessage, setFormMessage] = useState(""), [storeId, setStoreId] = useState(""), [severity, setSeverity] = useState("green"), [description, setDescription] = useState(""), [steps, setSteps] = useState(""), [number, setNumber] = useState(""), [files, setFiles] = useState<File[]>([]), [updateNote, setUpdateNote] = useState(""), [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false), [updating, setUpdating] = useState(false);
  const [subpage, setSubpage] = useState<SupportSubpage>("requests");
  const [technologyEquipmentType, setTechnologyEquipmentType] = useState<"" | TechnologyEquipmentType>(""), [technologyEquipmentId, setTechnologyEquipmentId] = useState(""), [technologyDevices, setTechnologyDevices] = useState<TechnologyDevice[]>([]);
  const submitInFlight = useRef(false), updateInFlight = useRef(false), fileInput = useRef<HTMLInputElement>(null), updateFileInput = useRef<HTMLInputElement>(null);
  const canDelete = profile.role === "admin" || profile.role === "accounting";
  const canSeeAll = profile.role === "supervisor" || profile.role === "accounting" || profile.role === "admin";
  const title = area === "maintenance" ? "Maintenance" : "Technology";

  const load = async () => {
    if (!supabase) return;
    let ticketQuery = supabase.from("support_tickets").select("id,severity,description,steps_taken,external_ticket_number,image_path,image_paths,status,acknowledged_at,created_at,technology_equipment_type,technology_equipment_id,technology_equipment!support_tickets_technology_equipment_id_fkey(label),stores(name),profiles!support_tickets_submitted_by_fkey(full_name),support_ticket_updates(id,note,status,image_path,image_paths,created_at,profiles!support_ticket_updates_author_id_fkey(full_name))").eq("area", area);
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
  useEffect(() => {
    if (!supabase || area !== "technology" || !storeId) { setTechnologyDevices([]); return; }
    let active = true;
    let query = supabase.from("technology_equipment").select("id,equipment_type,label").eq("store_id", storeId).eq("active", true);
    if (technologyEquipmentType) query = query.eq("equipment_type", technologyEquipmentType);
    void query.order("label").then(({ data }) => {
      if (!active) return;
      const devices = (data ?? []) as TechnologyDevice[];
      setTechnologyDevices(devices);
      setTechnologyEquipmentId(current => devices.some(device => device.id === current) ? current : "");
    });
    return () => { active = false; };
  }, [area, storeId, technologyEquipmentType]);

  const choosePhotos = (next: File[]) => {
    const selectedFiles = next.slice(0, MAX_REQUEST_PHOTOS);
    setFiles(selectedFiles);
    const large = selectedFiles.filter(file => file.size > EMAIL_READY_IMAGE_SIZE).length;
    setFormMessage(selectedFiles.length ? `${selectedFiles.length} photo${selectedFiles.length === 1 ? "" : "s"} selected.${large ? ` ${large} large photo${large === 1 ? " will" : "s will"} be optimized before submitting.` : ""}` : "");
  };
  const removePhoto = (index: number) => { setFiles(current => current.filter((_, itemIndex) => itemIndex !== index)); setFormMessage("Photo removed. The rest of your request is unchanged."); if (fileInput.current) fileInput.current.value = ""; };
  const removeUpdatePhoto = (index: number) => { setUpdateFiles(current => current.filter((_, itemIndex) => itemIndex !== index)); if (updateFileInput.current) updateFileInput.current.value = ""; };

  const upload = async (uploadFile: File) => {
    const ready = await optimizeTicketImage(uploadFile);
    const path = `${profile.id}/${crypto.randomUUID()}-${ready.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const { error } = await supabase!.storage.from("ticket-images").upload(path, ready, { contentType: ready.type });
    if (error) throw error;
    return path;
  };
  const uploadMany = async (selectedFiles: File[]) => {
    const settled = await Promise.allSettled(selectedFiles.map(upload));
    return {
      paths: settled.filter((result): result is PromiseFulfilledResult<string> => result.status === "fulfilled").map(result => result.value),
      failed: settled.filter(result => result.status === "rejected").length,
    };
  };
  const notifyResponders = async (ticketId: string, event: "submitted" | "completed") => {
    const result = await supabase!.functions.invoke("support-notifications", { body: { ticket_id: ticketId, event } });
    return !result.error && result.data?.ok === true;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitInFlight.current) return;
    submitInFlight.current = true; setSubmitting(true); setFormMessage(files.some(file => file.size > EMAIL_READY_IMAGE_SIZE) ? "Optimizing the large photos, then submitting your request…" : "Submitting your request…");
    try {
      const uploaded = await uploadMany(files);
      const photoWarning = uploaded.failed ? ` ${uploaded.failed} selected photo${uploaded.failed === 1 ? "" : "s"} could not be processed; the request and all other photos were saved.` : "";
      const { data, error } = await supabase!.from("support_tickets").insert({ area, submitted_by: profile.id, store_id: storeId, severity, description, steps_taken: steps, external_ticket_number: number || null, image_path: uploaded.paths[0] ?? null, image_paths: uploaded.paths, technology_equipment_type: area === "technology" ? technologyEquipmentType || null : null, technology_equipment_id: area === "technology" ? technologyEquipmentId || null : null }).select("id").single();
      if (error || !data) throw error ?? new Error("Request could not be saved.");
      // The request is now safely stored. Close the form immediately instead
      // of making the manager wait for Gmail delivery to finish.
      setShowForm(false); setDescription(""); setSteps(""); setNumber(""); setFiles([]); setTechnologyEquipmentType(""); setTechnologyEquipmentId("");
      setMessage("Request submitted. Notifying responders…");
      window.dispatchEvent(new Event("dashos:requests-changed")); void load();
      const notified = await notifyResponders(data.id, "submitted");
      setMessage((notified ? "Request submitted. Responders were notified." : "Request submitted, but the responder email could not be sent.") + photoWarning);
    } catch (error: any) { const detail = error?.message || "The request could not be submitted."; setMessage(detail); setFormMessage(`Request not submitted: ${detail}`); }
    finally { submitInFlight.current = false; setSubmitting(false); }
  };
  const update = async (status: string) => {
    if (!selected || updateInFlight.current) return;
    updateInFlight.current = true; setUpdating(true);
    try { const ticketId = selected.id, now = new Date().toISOString(); const uploaded = await uploadMany(updateFiles); const photoWarning = uploaded.failed ? ` ${uploaded.failed} selected photo${uploaded.failed === 1 ? "" : "s"} could not be processed; the update and all other photos were saved.` : ""; const patch: any = { status, updated_at: now }; if (status === "viewed" && !selected.acknowledged_at) { patch.acknowledged_at = now; patch.acknowledged_by = profile.id; } if (status === "completed") patch.completed_at = now; const { error } = await supabase!.from("support_tickets").update(patch).eq("id", ticketId); if (error) throw error; const { error: updateError } = await supabase!.from("support_ticket_updates").insert({ ticket_id: ticketId, author_id: profile.id, status, note: updateNote, image_path: uploaded.paths[0] ?? null, image_paths: uploaded.paths }); if (updateError) throw updateError; setSelected(null); setUpdateNote(""); setUpdateFiles([]); setMessage((status === "completed" ? "Request completed. Notifying responders…" : "Ticket updated.") + photoWarning); window.dispatchEvent(new Event("dashos:requests-changed")); void load(); const notified = status !== "completed" || await notifyResponders(ticketId, "completed"); if (status === "completed") setMessage((notified ? "Request completed. Responders were notified." : "Request completed, but the responder email could not be sent.") + photoWarning); } catch (error: any) { setMessage(error.message); }
    finally { updateInFlight.current = false; setUpdating(false); }
  };
  const remove = async () => { if (!supabase || !selected || !canDelete) return; if (!window.confirm("Permanently delete this support request and its progress history? This cannot be undone.")) return; const deleted = selected, paths = [...new Set([deleted.image_path, ...(deleted.image_paths ?? []), ...(deleted.support_ticket_updates ?? []).flatMap((entry) => [entry.image_path, ...(entry.image_paths ?? [])])].filter((path): path is string => Boolean(path)))]; const { error } = await supabase.from("support_tickets").delete().eq("id", deleted.id); if (error) { setMessage(error.message); return; } if (paths.length) await supabase.storage.from("ticket-images").remove(paths); setSelected(null); setMessage(`${title} request deleted.`); load(); };

  if (area === "maintenance" && subpage === "maintenance-equipment") {
    return <div className="page equipment-records-page">
      <div className="page-heading heading-with-action">
        <div><p className="eyebrow">Maintenance records</p><h1>Equipment records.</h1><p>Review store equipment details, pictures, serial numbers, and maintenance history.</p></div>
        <button className="button secondary" onClick={() => setSubpage("requests")}><ArrowLeft size={17}/> Maintenance requests</button>
      </div>
      <EquipmentInventory profile={profile} canRespond={canRespond}/>
    </div>;
  }

  if (area === "technology" && subpage === "technology-equipment") {
    return <div className="page equipment-records-page"><div className="page-heading heading-with-action"><div><p className="eyebrow">Technology records</p><h1>Technology equipment.</h1><p>Keep each store’s network equipment, computers, screens, printers, and payment devices organized.</p></div><button className="button secondary" onClick={() => setSubpage("requests")}><ArrowLeft size={17}/> Technology requests</button></div><TechnologyEquipment profile={profile} canRespond={canRespond}/></div>;
  }

  if (area === "technology" && subpage === "troubleshooting") {
    return <div className="page troubleshooting-page"><div className="page-heading heading-with-action"><div><p className="eyebrow">Technology help</p><h1>Troubleshooting guides.</h1><p>Follow consistent, equipment-specific checks before escalating an issue.</p></div><button className="button secondary" onClick={() => setSubpage("requests")}><ArrowLeft size={17}/> Technology requests</button></div><TroubleshootingLibrary profile={profile} canRespond={canRespond}/></div>;
  }

  return <div className="page"><div className="page-heading heading-with-action"><div><p className="eyebrow">{canSeeAll?"Store support":"My support history"}</p><h1>{canSeeAll?`${title} requests.`:`My ${title.toLowerCase()} requests.`}</h1><p>{canSeeAll?"Review submitted problems and follow their progress through completion.":"Submit a problem and follow the progress of requests you submitted."}</p></div><div className="support-heading-actions">{area==="maintenance"&&<button className="button secondary" onClick={() => setSubpage("maintenance-equipment")}><Wrench size={17}/> Equipment records</button>}{area==="technology"&&<><button className="button secondary" onClick={() => setSubpage("technology-equipment")}><MonitorCog size={17}/> Technology equipment</button><button className="button secondary" onClick={() => setSubpage("troubleshooting")}><BookOpenCheck size={17}/> Troubleshooting</button></>}<button className="button primary" onClick={() => { setFormMessage(""); setShowForm(true); }}><Plus /> New request</button></div></div>{message && <p className="inline-message">{message}</p>}<div className="ticket-grid">{tickets.map((ticket) => <button className={`ticket-card severity-${ticket.severity}`} key={ticket.id} onClick={() => setSelected(ticket)}><span className="severity-dot"/><div><small>{ticket.stores?.name} · {new Date(ticket.created_at).toLocaleString()}</small><strong>{ticket.description}</strong><span>{ticket.technology_equipment_type?`${ticket.technology_equipment_type}${ticket.technology_equipment?.label?` · ${ticket.technology_equipment.label}`:""} · `:""}Submitted by {ticket.profiles?.full_name}</span></div><span className="ticket-status">{ticket.status.replaceAll("_", " ")}</span></button>)}</div>
  {showForm && <div className="modal-backdrop" onClick={() => { if (!submitting) setShowForm(false); }}><form className="ticket-modal" onSubmit={submit} onClick={(event) => event.stopPropagation()}><button type="button" className="icon-button modal-close" disabled={submitting} onClick={() => setShowForm(false)}><X /></button><h2>New {title.toLowerCase()} request</h2>{formMessage && <p className={`photo-upload-notice ${formMessage.startsWith("Request not submitted") ? "error" : ""}`} role="status">{formMessage}</p>}<label>Store<select required disabled={submitting} value={storeId} onChange={(event) => setStoreId(event.target.value)}>{stores.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>{area==="technology"&&<><label>Equipment type <small>(optional)</small><select disabled={submitting} value={technologyEquipmentType} onChange={event=>{setTechnologyEquipmentType(event.target.value as ""|TechnologyEquipmentType);setTechnologyEquipmentId("");}}><option value="">General issue / not sure</option>{technologyEquipmentTypes.map(type=><option key={type}>{type}</option>)}</select></label><label>Specific store equipment <small>(optional)</small><select disabled={submitting||technologyDevices.length===0} value={technologyEquipmentId} onChange={event=>{const id=event.target.value;setTechnologyEquipmentId(id);const device=technologyDevices.find(item=>item.id===id);if(device)setTechnologyEquipmentType(device.equipment_type);}}><option value="">{technologyDevices.length?"Not tied to a registered device":"No matching registered equipment"}</option>{technologyDevices.map(device=><option key={device.id} value={device.id}>{device.label} — {device.equipment_type}</option>)}</select></label></>}<label>Severity<select disabled={submitting} value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="green">Green — Mild inconvenience</option><option value="yellow">Yellow — Operational with workaround</option><option value="red">Red — Store is not operational</option></select></label><label>Problem description<textarea required disabled={submitting} rows={4} value={description} onChange={(event) => setDescription(event.target.value)}/></label><label>Steps already taken<textarea disabled={submitting} rows={3} value={steps} onChange={(event) => setSteps(event.target.value)}/></label><label>Related ticket number<input disabled={submitting} value={number} onChange={(event) => setNumber(event.target.value)}/></label><label>Pictures <small>(optional · up to {MAX_REQUEST_PHOTOS})</small><input ref={fileInput} disabled={submitting} multiple type="file" accept="image/*" onChange={(event) => choosePhotos(Array.from(event.target.files ?? []))}/></label>{files.length>0&&<div className="ticket-selected-photos">{files.map((file,index)=><div key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><button type="button" className="icon-button" aria-label={`Remove ${file.name}`} disabled={submitting} onClick={()=>removePhoto(index)}><X size={16}/></button></div>)}</div>}<button className="button primary full" disabled={submitting}>{submitting ? "Submitting…" : "Submit request"}</button></form></div>}
  {selected && <div className="modal-backdrop" onClick={() => { if (!updating) setSelected(null); }}><section className="ticket-modal ticket-detail" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" disabled={updating} onClick={() => setSelected(null)}><X /></button><p className="eyebrow">{selected.stores?.name} · {selected.severity}</p><h2>{selected.description}</h2><dl><div><dt>Status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div>{selected.technology_equipment_type&&<div><dt>Equipment type</dt><dd>{selected.technology_equipment_type}</dd></div>}{selected.technology_equipment?.label&&<div><dt>Registered device</dt><dd>{selected.technology_equipment.label}</dd></div>}<div><dt>Acknowledged</dt><dd>{selected.acknowledged_at ? new Date(selected.acknowledged_at).toLocaleString() : "Not yet"}</dd></div><div><dt>Steps taken</dt><dd>{selected.steps_taken || "None"}</dd></div><div><dt>Ticket number</dt><dd>{selected.external_ticket_number || "None"}</dd></div></dl><PhotoLinks paths={[selected.image_path,...(selected.image_paths??[])]}/><h3>Progress notes</h3>{selected.support_ticket_updates?.map((entry) => <div className="ticket-update" key={entry.id}><strong>{entry.status?.replaceAll("_", " ")}</strong><p>{entry.note || "No note"}</p><PhotoLinks paths={[entry.image_path,...(entry.image_paths??[])]}/><small>{entry.profiles?.full_name} · {new Date(entry.created_at).toLocaleString()}</small></div>)}{canRespond && <div className="responder-box"><h3>Responder update</h3><label>Notes<textarea disabled={updating} rows={3} value={updateNote} onChange={(event) => setUpdateNote(event.target.value)}/></label><label>Pictures <small>(optional · up to {MAX_REQUEST_PHOTOS})</small><input ref={updateFileInput} disabled={updating} multiple type="file" accept="image/*" onChange={(event) => setUpdateFiles(Array.from(event.target.files ?? []).slice(0,MAX_REQUEST_PHOTOS))}/></label>{updateFiles.length>0&&<div className="ticket-selected-photos">{updateFiles.map((file,index)=><div key={`${file.name}-${file.lastModified}`}><span>{file.name}</span><button type="button" className="icon-button" aria-label={`Remove ${file.name}`} disabled={updating} onClick={()=>removeUpdatePhoto(index)}><X size={16}/></button></div>)}</div>}<div className="button-row"><button className="button secondary" disabled={updating} onClick={() => update("viewed")}><Eye /> Viewed</button><button className="button secondary" disabled={updating} onClick={() => update("in_progress")}><AlertTriangle /> In progress</button><button className="button primary" disabled={updating} onClick={() => update("completed")}><CheckCircle2 /> {updating ? "Saving…" : "Completed"}</button></div></div>}{canDelete && <div className="request-admin-actions"><button className="button secondary danger" disabled={updating} onClick={remove}><Trash2 size={17}/> Delete request</button></div>}</section></div>}</div>;
}
