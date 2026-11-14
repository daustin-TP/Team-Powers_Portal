import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Flame, History, ImagePlus, Pencil, Plus, Refrigerator, Save, Warehouse, Wrench, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Profile } from "../types";

const categories = ["Oven", "Walk-In", "Makeline", "Reach-In Cooler", "Heat Rack", "Other"] as const;
type EquipmentCategory = typeof categories[number];
type Store = { id:string; name:string; store_number:string|null };
type ServiceLog = { id:string; service_date:string; work_performed:string; created_at:string; profiles?:{full_name:string}|null };
type Equipment = {
  id:string; store_id:string; category:EquipmentCategory; label:string; make:string; model:string;
  serial_number:string; image_path:string|null; active:boolean; created_at:string; updated_at:string;
  maintenance_equipment_service_logs?:ServiceLog[];
};
type Draft = { category:EquipmentCategory; label:string; make:string; model:string; serial_number:string };

const emptyDraft:Draft={category:"Oven",label:"",make:"",model:"",serial_number:""};
const equipmentIcons:Record<EquipmentCategory,typeof Wrench>={
  Oven:Flame,
  "Walk-In":Warehouse,
  Makeline:Box,
  "Reach-In Cooler":Refrigerator,
  "Heat Rack":Flame,
  Other:Wrench,
};
const localToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Chicago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const displayDate=(value:string)=>new Date(`${value}T12:00:00`).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
const storeName=(store:Store)=>store.store_number?`${store.name} ${store.store_number}`:store.name;

function canvasBlob(canvas:HTMLCanvasElement,quality:number){
  return new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("The equipment picture could not be optimized.")),"image/jpeg",quality));
}

async function optimizeEquipmentImage(original:File){
  if(original.size<=5*1024*1024&&["image/jpeg","image/png","image/webp"].includes(original.type))return original;
  const bitmap=await createImageBitmap(original);
  try{
    let scale=Math.min(1,2200/Math.max(bitmap.width,bitmap.height)),latest:Blob|null=null;
    for(const quality of [0.84,0.72,0.60]){
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext("2d");if(!context)throw Error("The equipment picture could not be optimized.");
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);latest=await canvasBlob(canvas,quality);
      if(latest.size<=5*1024*1024)break;scale*=.78;
    }
    if(!latest||latest.size>8*1024*1024)throw Error("Choose a picture smaller than 8 MB.");
    const name=(original.name.replace(/\.[^.]+$/,"" ).replace(/[^a-z0-9_-]/gi,"-")||"equipment")+".jpg";
    return new File([latest],name,{type:"image/jpeg",lastModified:Date.now()});
  }finally{bitmap.close();}
}

function EquipmentPhoto({path,alt,className}:{path:string;alt:string;className:string}){
  const [url,setUrl]=useState("");
  useEffect(()=>{
    let active=true;setUrl("");
    void supabase?.storage.from("equipment-images").createSignedUrl(path,1800).then(({data})=>{if(active)setUrl(data?.signedUrl??"");});
    return()=>{active=false;};
  },[path]);
  return url?<img src={url} alt={alt} className={className}/>:<div className={`${className} equipment-photo-loading`}>Preparing photo…</div>;
}

export default function EquipmentInventory({profile,canRespond}:{profile:Profile;canRespond:boolean}){
  const [stores,setStores]=useState<Store[]>([]),[storeId,setStoreId]=useState(""),[equipment,setEquipment]=useState<Equipment[]>([]);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[message,setMessage]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null),[editorId,setEditorId]=useState<"new"|string|null>(null),[draft,setDraft]=useState<Draft>(emptyDraft);
  const [photo,setPhoto]=useState<File|null>(null),[showArchived,setShowArchived]=useState(false);
  const [serviceDate,setServiceDate]=useState(localToday()),[workPerformed,setWorkPerformed]=useState("");
  const photoInput=useRef<HTMLInputElement>(null);
  const selected=useMemo(()=>equipment.find(item=>item.id===selectedId)??null,[equipment,selectedId]);
  const canManage=profile.role==="admin"||profile.role==="supervisor"||profile.role==="manager"||canRespond;

  useEffect(()=>{
    if(!supabase)return;
    let active=true;
    void Promise.all([
      supabase.from("stores").select("id,name,store_number").eq("active",true).not("store_number","is",null).order("store_number"),
      supabase.from("profile_store_assignments").select("store_id").eq("profile_id",profile.id),
    ]).then(([storeResult,assignmentResult])=>{
      if(!active)return;
      if(storeResult.error){setMessage(storeResult.error.message);return;}
      const assigned=new Set([profile.storeId,...(assignmentResult.data??[]).map(row=>row.store_id)].filter(Boolean));
      const visible=((storeResult.data??[]) as Store[]).filter(store=>profile.role==="admin"||canRespond||assigned.has(store.id));
      setStores(visible);setStoreId(current=>visible.some(store=>store.id===current)?current:(visible[0]?.id??""));
    });
    return()=>{active=false;};
  },[profile.id,profile.role,profile.storeId,canRespond]);

  const loadEquipment=useCallback(async(focusId?:string)=>{
    if(!supabase||!storeId){setEquipment([]);setLoading(false);return;}
    setLoading(true);
    let query=supabase.from("maintenance_equipment").select("id,store_id,category,label,make,model,serial_number,image_path,active,created_at,updated_at,maintenance_equipment_service_logs(id,service_date,work_performed,created_at,profiles!maintenance_equipment_service_logs_recorded_by_fkey(full_name))").eq("store_id",storeId);
    query=showArchived?query:query.eq("active",true);
    const {data,error}=await query.order("category").order("label");
    if(error)setMessage(error.message);
    else{
      const next=(data??[]) as unknown as Equipment[];
      next.forEach(item=>item.maintenance_equipment_service_logs?.sort((a,b)=>b.service_date.localeCompare(a.service_date)||b.created_at.localeCompare(a.created_at)));
      setEquipment(next);
      if(focusId)setSelectedId(focusId);else setSelectedId(current=>next.some(item=>item.id===current)?current:null);
    }
    setLoading(false);
  },[storeId,showArchived]);
  useEffect(()=>{setMessage("");void loadEquipment();},[loadEquipment]);

  const beginAdd=()=>{setDraft(emptyDraft);setPhoto(null);setEditorId("new");};
  const beginEdit=(item:Equipment)=>{setDraft({category:item.category,label:item.label,make:item.make,model:item.model,serial_number:item.serial_number});setPhoto(null);setEditorId(item.id);};
  const uploadPhoto=async(file:File)=>{
    const ready=await optimizeEquipmentImage(file);
    const safe=ready.name.replace(/[^a-z0-9._-]/gi,"-");
    const path=`${storeId}/${profile.id}/${crypto.randomUUID()}-${safe}`;
    const {error}=await supabase!.storage.from("equipment-images").upload(path,ready,{contentType:ready.type});
    if(error)throw error;return path;
  };
  const saveEquipment=async(event:FormEvent)=>{
    event.preventDefault();if(!supabase||!storeId||!editorId||saving)return;
    setSaving(true);setMessage("");let newImagePath:string|null=null;
    try{
      if(photo)newImagePath=await uploadPhoto(photo);
      const existing=editorId==="new"?null:equipment.find(item=>item.id===editorId);
      const payload={store_id:storeId,category:draft.category,label:draft.label.trim(),make:draft.make.trim(),model:draft.model.trim(),serial_number:draft.serial_number.trim(),image_path:newImagePath??existing?.image_path??null,updated_by:profile.id};
      const result=editorId==="new"
        ?await supabase.from("maintenance_equipment").insert({...payload,created_by:profile.id}).select("id").single()
        :await supabase.from("maintenance_equipment").update(payload).eq("id",editorId).select("id").single();
      if(result.error||!result.data)throw result.error??Error("Equipment could not be saved.");
      if(newImagePath&&existing?.image_path)void supabase.storage.from("equipment-images").remove([existing.image_path]);
      setEditorId(null);setPhoto(null);if(photoInput.current)photoInput.current.value="";
      setMessage(editorId==="new"?"Equipment added.":"Equipment details updated.");await loadEquipment(result.data.id);
    }catch(error:any){
      if(newImagePath)void supabase.storage.from("equipment-images").remove([newImagePath]);
      setMessage(error?.code==="23505"?"That equipment label is already in use for this store.":error?.message||"Equipment could not be saved.");
    }finally{setSaving(false);}
  };
  const setActive=async(item:Equipment,active:boolean)=>{
    if(!supabase||saving)return;
    if(!active&&!window.confirm(`Archive ${item.label}? Its maintenance history will be preserved.`))return;
    setSaving(true);const {error}=await supabase.from("maintenance_equipment").update({active,updated_by:profile.id,updated_at:new Date().toISOString()}).eq("id",item.id);
    if(error)setMessage(error.message);else{setSelectedId(null);setMessage(active?"Equipment restored.":"Equipment archived. Its maintenance history is preserved.");await loadEquipment();}setSaving(false);
  };
  const addServiceLog=async(event:FormEvent)=>{
    event.preventDefault();if(!supabase||!selected||!workPerformed.trim()||saving)return;
    setSaving(true);const {error}=await supabase.from("maintenance_equipment_service_logs").insert({equipment_id:selected.id,service_date:serviceDate,work_performed:workPerformed.trim(),recorded_by:profile.id});
    if(error)setMessage(error.message);else{setWorkPerformed("");setServiceDate(localToday());setMessage("Maintenance work added to the equipment history.");await loadEquipment(selected.id);}setSaving(false);
  };

  return <section className="equipment-panel">
    <div className="equipment-toolbar"><div><p className="eyebrow">Equipment list</p><h2>Store equipment records</h2><p>Make, model, serial number, pictures, and maintenance history in one place.</p></div><div className="equipment-toolbar-actions"><label>Store<select value={storeId} onChange={event=>setStoreId(event.target.value)}>{stores.map(store=><option key={store.id} value={store.id}>{storeName(store)}</option>)}</select></label>{canManage&&<button className="button primary" disabled={!storeId} onClick={beginAdd}><Plus size={17}/>Add equipment</button>}</div></div>
    <div className="equipment-filter-row"><label className="menu-check"><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/> Show archived equipment</label><span>{equipment.length} item{equipment.length===1?"":"s"}</span></div>
    {message&&<p className="inline-message">{message}</p>}
    {loading?<div className="activity-empty">Opening equipment records…</div>:equipment.length===0?<div className="equipment-empty"><Wrench size={28}/><strong>No equipment has been added for this store</strong><span>Use Add equipment to begin the store record.</span></div>:<div className="equipment-grid">{equipment.map(item=>{const Icon=equipmentIcons[item.category];const last=item.maintenance_equipment_service_logs?.[0];return <button className={`equipment-card${item.active?"":" archived"}`} key={item.id} onClick={()=>setSelectedId(item.id)}>{item.image_path?<EquipmentPhoto path={item.image_path} alt={item.label} className="equipment-card-photo"/>:<span className="equipment-card-icon"><Icon/></span>}<span className="equipment-card-copy"><small>{item.category}{!item.active?" · Archived":""}</small><strong>{item.label}</strong><span>{[item.make,item.model].filter(Boolean).join(" · ")||"Make and model not entered"}</span><span>Serial: {item.serial_number||"Not entered"}</span>{last&&<em><History size={13}/>Last service {displayDate(last.service_date)}</em>}</span></button>;})}</div>}

    {selected&&editorId===null&&<div className="modal-backdrop" onClick={()=>setSelectedId(null)}><section className="ticket-modal equipment-detail" onClick={event=>event.stopPropagation()}><button className="icon-button modal-close" onClick={()=>setSelectedId(null)}><X/></button><div className="equipment-detail-hero">{selected.image_path?<EquipmentPhoto path={selected.image_path} alt={selected.label} className="equipment-detail-photo"/>:<span className="equipment-detail-icon">{(()=>{const Icon=equipmentIcons[selected.category];return <Icon/>;})()}</span>}<div><p className="eyebrow">{selected.category}</p><h2>{selected.label}</h2><p>{stores.find(store=>store.id===selected.store_id)?storeName(stores.find(store=>store.id===selected.store_id)!):"Store equipment"}</p></div></div><dl className="equipment-facts"><div><dt>Make</dt><dd>{selected.make||"Not entered"}</dd></div><div><dt>Model</dt><dd>{selected.model||"Not entered"}</dd></div><div><dt>Serial number</dt><dd>{selected.serial_number||"Not entered"}</dd></div></dl>{canManage&&<div className="button-row"><button className="button secondary" onClick={()=>beginEdit(selected)}><Pencil size={16}/>Edit details</button><button className="button secondary" disabled={saving} onClick={()=>void setActive(selected,!selected.active)}>{selected.active?"Archive":"Restore"}</button></div>}<div className="equipment-history"><div><p className="eyebrow">Maintenance log</p><h3>Service history</h3></div>{selected.maintenance_equipment_service_logs?.length?<div className="equipment-log-list">{selected.maintenance_equipment_service_logs.map(log=><article key={log.id}><time>{displayDate(log.service_date)}</time><p>{log.work_performed}</p><small>Recorded by {log.profiles?.full_name||"DASH user"} · {new Date(log.created_at).toLocaleString()}</small></article>)}</div>:<div className="equipment-log-empty">No maintenance work has been recorded yet.</div>}{canManage&&selected.active&&<form className="equipment-log-form" onSubmit={addServiceLog}><label>Work date<input type="date" required value={serviceDate} onChange={event=>setServiceDate(event.target.value)}/></label><label>Work performed<textarea required minLength={3} rows={3} placeholder="Describe the repair, maintenance, or parts replaced" value={workPerformed} onChange={event=>setWorkPerformed(event.target.value)}/></label><button className="button primary" disabled={saving}><Plus size={16}/>{saving?"Saving…":"Add maintenance entry"}</button></form>}</div></section></div>}

    {editorId!==null&&<div className="modal-backdrop" onClick={()=>{if(!saving)setEditorId(null);}}><form className="ticket-modal equipment-editor" onSubmit={saveEquipment} onClick={event=>event.stopPropagation()}><button type="button" className="icon-button modal-close" disabled={saving} onClick={()=>setEditorId(null)}><X/></button><p className="eyebrow">{editorId==="new"?"New equipment":"Equipment details"}</p><h2>{editorId==="new"?"Add equipment":"Update equipment"}</h2><label>Equipment type<select value={draft.category} onChange={event=>setDraft({...draft,category:event.target.value as EquipmentCategory})}>{categories.map(category=><option key={category}>{category}</option>)}</select></label><label>Custom label<input required maxLength={120} placeholder="Example: Left Makeline" value={draft.label} onChange={event=>setDraft({...draft,label:event.target.value})}/><small>Use the name your team recognizes, such as Left Makeline or Main Oven.</small></label><div className="equipment-editor-grid"><label>Make<input maxLength={160} value={draft.make} onChange={event=>setDraft({...draft,make:event.target.value})}/></label><label>Model<input maxLength={160} value={draft.model} onChange={event=>setDraft({...draft,model:event.target.value})}/></label></div><label>Serial number<input maxLength={200} value={draft.serial_number} onChange={event=>setDraft({...draft,serial_number:event.target.value})}/></label><label>Equipment picture <small>(optional)</small><input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>setPhoto(event.target.files?.[0]??null)}/></label>{photo&&<div className="equipment-photo-ready"><ImagePlus size={17}/><span>{photo.name}</span><button type="button" className="icon-button" onClick={()=>{setPhoto(null);if(photoInput.current)photoInput.current.value="";}}><X size={16}/></button></div>}<button className="button primary full" disabled={saving||!draft.label.trim()}><Save size={17}/>{saving?"Saving…":"Save equipment"}</button></form></div>}
  </section>;
}
