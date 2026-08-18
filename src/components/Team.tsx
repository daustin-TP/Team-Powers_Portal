import { FormEvent, useEffect, useState } from "react";
import { MailPlus, MoreHorizontal, Plus, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { teamMembers } from "../data/demo";
import type { Profile, Role } from "../types";
import { supabase } from "../lib/supabase";

const OWNER_EMAIL = "daustin@powerspizza.com";
type Store={id:string;name:string;active:boolean}; type Member=Profile&{storeId?:string|null;capabilities?:string[]};
type Invitation={id:string;email:string;fullName:string;role:Role;location:string;storeId:string|null;active:boolean};

export default function Team({ currentProfile }: { currentProfile: Profile }) {
  const [members, setMembers] = useState<Member[]>(teamMembers);
  const [pendingInvites,setPendingInvites]=useState<Invitation[]>([]);
  const [stores,setStores]=useState<Store[]>([]); const [newStore,setNewStore]=useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const loadDirectory=async()=>{
    if(!supabase)return;
    const[profileResult,inviteResult]=await Promise.all([
      supabase.from("profiles").select("id,email,full_name,role,location,active,store_id,profile_capabilities(capability)").order("full_name"),
      supabase.from("invited_employees").select("id,email,full_name,role,location,active,store_id").eq("active",true).order("full_name"),
    ]);
    if(profileResult.error||inviteResult.error){setMessage(`Team directory could not be loaded: ${profileResult.error?.message??inviteResult.error?.message}`);return}
    const profileEmails=new Set((profileResult.data??[]).map(member=>member.email.toLowerCase()));
    setMembers((profileResult.data??[]).map((member) => ({
          id: member.id,
          email: member.email,
          fullName: member.full_name,
          role: member.role,
          location: member.location,
          active: member.active,storeId:member.store_id,capabilities:(member.profile_capabilities??[]).map((x:any)=>x.capability),
        })));
    setPendingInvites((inviteResult.data??[]).filter(invite=>!profileEmails.has(invite.email.toLowerCase())).map(invite=>({id:invite.id,email:invite.email,fullName:invite.full_name,role:invite.role,location:invite.location,storeId:invite.store_id,active:invite.active})));
  };
  useEffect(() => {loadDirectory()}, []);
  const loadStores=()=>supabase?.from("stores").select("id,name,active").order("name").then(({data})=>setStores(data??[])); useEffect(()=>{loadStores()},[]);
  const addStore=async()=>{if(!supabase||!newStore.trim())return;const{error}=await supabase.from("stores").insert({name:newStore.trim()});if(error)setMessage(error.message);else{setNewStore("");loadStores()}};
  const renameStore=async(s:Store)=>{const name=window.prompt("Store name",s.name)?.trim();if(!name||!supabase)return;await supabase.from("stores").update({name,updated_at:new Date().toISOString()}).eq("id",s.id);loadStores()};
  const toggleStore=async(s:Store)=>{if(!supabase)return;await supabase.from("stores").update({active:!s.active}).eq("id",s.id);loadStores()};
  const assignStore=async(m:Member,id:string)=>{if(!supabase)return;const s=stores.find(x=>x.id===id),{error}=await supabase.from("profiles").update({store_id:id||null,location:s?.name??"Unassigned"}).eq("id",m.id);if(error)setMessage(error.message);else setMembers(v=>v.map(x=>x.id===m.id?{...x,storeId:id,location:s?.name??"Unassigned"}:x))};
  const setCapability=async(m:Member,c:"maintenance"|"technology",enabled:boolean)=>{if(!supabase)return;const r=enabled?await supabase.from("profile_capabilities").insert({profile_id:m.id,capability:c}):await supabase.from("profile_capabilities").delete().eq("profile_id",m.id).eq("capability",c);if(r.error)setMessage(r.error.message);else setMembers(v=>v.map(x=>x.id===m.id?{...x,capabilities:enabled?[...(x.capabilities??[]),c]:(x.capabilities??[]).filter(y=>y!==c)}:x))};
  const changeRole=async(m:Member,nextRole:Role)=>{if(m.email.toLowerCase()===OWNER_EMAIL){setMessage("The portal owner must remain an administrator.");return}if(!supabase)return;const {error}=await supabase.from("profiles").update({role:nextRole,updated_at:new Date().toISOString()}).eq("id",m.id);if(error){setMessage(error.message);return}await supabase.from("invited_employees").update({role:nextRole}).eq("email",m.email.toLowerCase());setMembers(v=>v.map(x=>x.id===m.id?{...x,role:nextRole}:x));setMessage(`${m.fullName} is now assigned the ${nextRole} role.`)};

  const invite = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();
    const fullName = normalizedEmail.split("@")[0].replace(/[._-]/g, " ");
    if (supabase) {
      const { error } = await supabase.from("invited_employees").upsert(
        {
          email: normalizedEmail,
          full_name: fullName,
          role,
          location: location || "Unassigned",
          store_id:stores.find(s=>s.name===location)?.id??null,
          active: true,
        },
        { onConflict: "email" },
      );
      if (error) {
        setMessage(`This email could not be authorized: ${error.message}`);
        setSaving(false);
        return;
      }
      await loadDirectory();
    } else {
      setMembers((current) => [...current, {
        id: crypto.randomUUID(),
        email: normalizedEmail,
        fullName,
        role,
        location: location || "Unassigned",
        active: true,
      }]);
    }
    setMessage(`${normalizedEmail} is authorized and can request a sign-in link.`);
    setEmail("");
    setLocation("");
    setShowInvite(false);
    setSaving(false);
  };

  const toggle = async (id: string) => {
    const member = members.find((item) => item.id === id);
    if (!member) return;
    if (member.email.toLowerCase() === OWNER_EMAIL) {
      setMessage("The portal owner account is protected and cannot be deactivated.");
      setOpenMenu(null);
      return;
    }
    if (supabase) {
      const { error } = await supabase
        .from("profiles")
        .update({ active: !member.active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        setMessage("Access could not be changed. Please try again.");
        return;
      }
    }
    setMembers((current) => current.map((item) => item.id === id ? { ...item, active: !item.active } : item));
    setMessage(`${member.fullName} is now ${member.active ? "deactivated" : "active"}.`);
    setOpenMenu(null);
  };

  return (
    <div className="page">
      <div className="page-heading heading-with-action">
        <div><p className="eyebrow">Administrator</p><h1>Team access.</h1><p>Invite work emails, assign roles, and remove access immediately when needed.</p></div>
        <button className="button primary" onClick={() => setShowInvite(true)}><MailPlus size={18} /> Invite team member</button>
      </div>
      <div className="admin-note"><ShieldCheck size={20} /><div><strong>Invitation-only access</strong><p>A valid work Gmail address is not enough by itself. Only people in this directory can enter the portal.</p></div></div>
      <section className="panel store-admin"><div><h2>Stores</h2><p>Add, rename, deactivate, and assign stores.</p></div><div className="store-add"><input value={newStore} onChange={e=>setNewStore(e.target.value)} placeholder="New store name"/><button className="button secondary" onClick={addStore}><Plus/> Add store</button></div><div className="store-chips">{stores.map(s=><span className={!s.active?"inactive":""} key={s.id}>{s.name}<button onClick={()=>renameStore(s)}>Edit</button><button onClick={()=>toggleStore(s)}>{s.active?"Remove":"Restore"}</button></span>)}</div></section>
      {message && <p className="inline-message">{message}</p>}
      {showInvite && (
        <form className="invite-card" onSubmit={invite}>
          <div><p className="eyebrow">New team member</p><h2>Send an invitation</h2></div>
          <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@powerspizza.com" required /></label>
          <label>Portal role<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="manager">Manager</option><option value="accounting">Accounting</option><option value="admin">Administrator</option></select></label>
          <label>Store<select value={location} onChange={e=>setLocation(e.target.value)}><option value="">Unassigned</option>{stores.filter(s=>s.active).map(s=><option key={s.id}>{s.name}</option>)}</select></label>
          <div className="button-row"><button type="button" className="button secondary" onClick={() => setShowInvite(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Authorizing…" : "Authorize email"}</button></div>
        </form>
      )}
      {pendingInvites.length>0&&<section className="panel pending-invitations"><div><p className="eyebrow">Awaiting first sign-in</p><h2>Pending invitations</h2><p>These emails are authorized in Supabase. They will move into the employee directory after their first successful sign-in.</p></div><div className="pending-invite-list">{pendingInvites.map(invite=><div key={invite.id}><div><strong>{invite.fullName}</strong><small>{invite.email}</small></div><span className="role-pill">{invite.role}</span><span>{invite.location}</span></div>)}</div></section>}
      <section className="panel table-panel">
        <div className="table-toolbar"><div><h2>Employee directory</h2><p>{members.filter((member) => member.active).length} active accounts</p></div><label className="search-field"><Search size={17} /><input placeholder="Search team" /></label></div>
        <div className="responsive-table">
          <table>
            <thead><tr><th>Team member</th><th>Role</th><th>Location</th><th>Access</th><th></th></tr></thead>
            <tbody>{members.map((member) => (
              <tr key={member.id}>
                <td><div className="person-cell"><span className="avatar small">{member.fullName.slice(0, 1).toUpperCase()}</span><span><strong>{member.fullName}</strong><small>{member.email}</small></span></div></td>
                <td><span className="role-pill">{member.role}{member.email.toLowerCase() === OWNER_EMAIL ? " · Owner" : ""}</span></td><td>{member.location}</td>
                <td><span className={`access-status ${member.active ? "active" : "inactive"}`}>{member.active ? <UserCheck size={15} /> : <UserX size={15} />}{member.active ? "Active" : "Disabled"}</span></td>
                <td className="member-actions"><button className="icon-button" aria-label={`Open options for ${member.fullName}`} aria-expanded={openMenu === member.id} onClick={() => setOpenMenu(openMenu === member.id ? null : member.id)}><MoreHorizontal size={18} /></button>
                  {openMenu === member.id && <div className="member-menu">
                    <strong>{member.fullName}</strong>
                    {member.email.toLowerCase() === OWNER_EMAIL || member.id === currentProfile.id
                      ? <span>This administrator account is protected.</span>
                      : <button type="button" onClick={() => toggle(member.id)}>{member.active ? <><UserX size={15}/> Deactivate access</> : <><UserCheck size={15}/> Reactivate access</>}</button>}
                    <label>Assigned store<select value={member.storeId??""} onChange={e=>assignStore(member,e.target.value)}><option value="">Unassigned</option>{stores.filter(s=>s.active).map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
                    <label>Primary role<select value={member.role} disabled={member.email.toLowerCase()===OWNER_EMAIL} onChange={e=>changeRole(member,e.target.value as Role)}><option value="employee">Employee</option><option value="supervisor">Supervisor</option><option value="manager">Manager</option><option value="accounting">Accounting</option><option value="admin">Administrator</option></select></label>
                    <label className="menu-check"><input type="checkbox" checked={member.capabilities?.includes("maintenance")??false} onChange={e=>setCapability(member,"maintenance",e.target.checked)}/> Maintenance responder</label>
                    <label className="menu-check"><input type="checkbox" checked={member.capabilities?.includes("technology")??false} onChange={e=>setCapability(member,"technology",e.target.checked)}/> Technology responder</label>
                  </div>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
