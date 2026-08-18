import { FormEvent, useEffect, useState } from "react";
import { MailPlus, MoreHorizontal, Search, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { teamMembers } from "../data/demo";
import type { Profile, Role } from "../types";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const OWNER_EMAIL = "daustin@powerspizza.com";

export default function Team({ currentProfile }: { currentProfile: Profile }) {
  const [members, setMembers] = useState<Profile[]>(teamMembers);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("profiles")
      .select("id,email,full_name,role,location,active")
      .order("full_name")
      .then(({ data }) => {
        if (!data) return;
        setMembers(data.map((member) => ({
          id: member.id,
          email: member.email,
          fullName: member.full_name,
          role: member.role,
          location: member.location,
          active: member.active,
        })));
      });
  }, []);

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
          active: true,
        },
        { onConflict: "email" },
      );
      if (error) {
        setMessage("This email could not be authorized. Please try again.");
        setSaving(false);
        return;
      }
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
      {message && <p className="inline-message">{message}</p>}
      {showInvite && (
        <form className="invite-card" onSubmit={invite}>
          <div><p className="eyebrow">New team member</p><h2>Send an invitation</h2></div>
          <label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@powerspizza.com" required /></label>
          <label>Portal role<select value={role} onChange={(event) => setRole(event.target.value as Role)}><option value="employee">Employee</option><option value="manager">Manager</option><option value="accounting">Accounting</option><option value="admin">Administrator</option></select></label>
          <label>Location<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Store or department" /></label>
          <div className="button-row"><button type="button" className="button secondary" onClick={() => setShowInvite(false)}>Cancel</button><button className="button primary" disabled={saving}>{saving ? "Authorizing…" : "Authorize email"}</button></div>
        </form>
      )}
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
