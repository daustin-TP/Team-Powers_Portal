import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, Minus, Package, Plus, ShoppingCart } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { CatalogCategory, CatalogItem, Profile } from "../types";

const fallback: CatalogItem[] = [
  { id: "sample", category: "uniform", name: "Sample uniform item", description: "Add your real products in Catalog management.", price: 0, imagePath: null, imageUrl: null, sizes: ["S","M","L","XL"], active: true },
];

export default function Uniforms({ profile, category = "uniform" }: { profile: Profile; category?: CatalogCategory }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [responsibility, setResponsibility] = useState<"employee_deduction"|"store_purchase">(category === "uniform" ? "employee_deduction" : "store_purchase");
  const [employees, setEmployees] = useState<{id:string;full_name:string}[]>([]);
  const [employeeId, setEmployeeId] = useState(profile.id);
  const [storeName, setStoreName] = useState(profile.location);
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabase) { setItems(fallback.filter(x => x.category === category)); return; }
    supabase.from("catalog_items").select("*").eq("category", category).eq("active", true).order("name").then(({data}) => {
      setItems((data ?? []).map((x:any) => ({ id:x.id, category:x.category, name:x.name, description:x.description, price:Number(x.price), imagePath:x.image_path, imageUrl:x.image_path ? supabase!.storage.from("catalog-images").getPublicUrl(x.image_path).data.publicUrl : null, sizes:x.sizes ?? [], active:x.active })));
    });
    supabase.from("profiles").select("id,full_name").eq("active", true).order("full_name").then(({data}) => setEmployees(data ?? []));
  }, [category]);

  const lines = useMemo(() => items.filter(x => (qty[x.id] ?? 0) > 0), [items, qty]);
  const total = lines.reduce((sum,x) => sum + x.price * qty[x.id], 0);
  const adjust = (id:string, change:number) => setQty(q => ({...q, [id]:Math.max(0,(q[id]??0)+change)}));
  const submit = async (e:FormEvent) => {
    e.preventDefault(); setMessage(""); setBusy(true);
    if (!supabase) { setMessage("Order ready (demo mode)."); setBusy(false); return; }
    const {data:order,error} = await supabase.from("portal_orders").insert({ ordered_by:profile.id, responsibility, employee_id:responsibility === "employee_deduction" ? employeeId : null, store_name:responsibility === "store_purchase" ? storeName : null, category, notes, total }).select("id").single();
    if (error || !order) { setMessage(error?.message ?? "Order could not be saved."); setBusy(false); return; }
    const {error:itemError} = await supabase.from("portal_order_items").insert(lines.map(x => ({order_id:order.id,catalog_item_id:x.id,item_name:x.name,unit_price:x.price,quantity:qty[x.id],size:sizes[x.id] || null})));
    setBusy(false);
    if (itemError) { setMessage("Order was created, but its items could not be saved. Please contact an administrator."); return; }
    setQty({}); setNotes(""); setMessage("Order submitted successfully.");
  };

  const title = category === "uniform" ? "Uniform ordering" : "Smallwares ordering";
  return <div className="page"><div className="page-heading"><p className="eyebrow">{category === "uniform" ? "Uniforms" : "Smallwares"}</p><h1>{title}.</h1><p>Add approved items to your cart, then assign the purchase to an employee or store.</p></div>
    {message && <section className="inline-message"><Check size={16}/> {message}</section>}
    <form className="form-layout" onSubmit={submit}><section className="panel catalog-grid">
      {items.length === 0 && <div className="empty-card"><Package/><h2>No products yet</h2><p>An administrator can add products in Catalog management.</p></div>}
      {items.map(item => <article className="catalog-card" key={item.id}>
        <div className="catalog-image">{item.imageUrl ? <img src={item.imageUrl} alt={item.name}/> : <Package/>}</div>
        <div className="catalog-copy"><h2>{item.name}</h2><p>{item.description}</p><strong>${item.price.toFixed(2)}</strong></div>
        {item.sizes.length > 0 && <label>Size<select value={sizes[item.id] ?? item.sizes[0]} onChange={e=>setSizes(s=>({...s,[item.id]:e.target.value}))}>{item.sizes.map(s=><option key={s}>{s}</option>)}</select></label>}
        <div className="stepper"><button type="button" onClick={()=>adjust(item.id,-1)}><Minus size={15}/></button><span>{qty[item.id]??0}</span><button type="button" onClick={()=>adjust(item.id,1)}><Plus size={15}/></button></div>
      </article>)}
    </section><aside className="summary-card"><ShoppingCart/><h2>Cart</h2><dl>{lines.map(x=><div key={x.id}><dt>{qty[x.id]} × {x.name}{sizes[x.id] ? ` (${sizes[x.id]})`:""}</dt><dd>${(qty[x.id]*x.price).toFixed(2)}</dd></div>)}<div className="summary-total"><dt>Total</dt><dd>${total.toFixed(2)}</dd></div></dl>
      <label>Charge to<select value={responsibility} onChange={e=>setResponsibility(e.target.value as any)}><option value="employee_deduction">Named employee deduction</option><option value="store_purchase">Store purchase</option></select></label>
      {responsibility === "employee_deduction" ? <label>Employee<select value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>{employees.length ? employees.map(x=><option value={x.id} key={x.id}>{x.full_name}</option>) : <option value={profile.id}>{profile.fullName}</option>}</select></label> : <label>Store<input required value={storeName} onChange={e=>setStoreName(e.target.value)} placeholder="Store/location name"/></label>}
      <label>Order notes<textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} /></label><button className="button primary full" disabled={!lines.length || busy}>{busy ? "Submitting…" : "Submit order"}</button>
    </aside></form></div>;
}
