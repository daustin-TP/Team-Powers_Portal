import { useEffect, useState } from "react";
import { Check, Clock3, Package, X } from "lucide-react";
import type { Profile } from "../types";
import { supabase } from "../lib/supabase";

type ApprovalRequest = {
  id: string;
  person: string;
  type: string;
  detail: string;
  date: string;
  icon: typeof Package;
};

const demoRequests: ApprovalRequest[] = [
  { id: "1", person: "Taylor Employee", type: "Uniform request", detail: "2 T-shirts · Size M · $36.00", date: "Today, 9:42 AM", icon: Package },
];

export default function Approvals({ profile }: { profile: Profile }) {
  const [requests, setRequests] = useState<ApprovalRequest[]>(supabase ? [] : demoRequests);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from("uniform_requests")
      .select("id,items,shirt_size,estimated_total,created_at,profiles!uniform_requests_employee_id_fkey(full_name)")
      .eq("status", "submitted")
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) {
          setMessage("The approval queue could not be loaded.");
        } else {
          setRequests((data ?? []).map((request: any) => {
            const itemCount = Array.isArray(request.items)
              ? request.items.reduce((sum: number, item: any) => sum + Number(item.quantity ?? 0), 0)
              : 0;
            return {
              id: request.id,
              person: request.profiles?.full_name ?? "Team member",
              type: "Uniform request",
              detail: `${itemCount} item${itemCount === 1 ? "" : "s"} · Size ${request.shirt_size ?? "—"} · $${Number(request.estimated_total).toFixed(2)}`,
              date: new Date(request.created_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }),
              icon: Package,
            };
          }));
        }
        setLoading(false);
      });
  }, []);

  const resolve = async (id: string, status: "approved" | "returned") => {
    setMessage("");
    if (supabase) {
      const { error } = await supabase
        .from("uniform_requests")
        .update({
          status,
          reviewed_by: profile.id,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) {
        setMessage("The request could not be updated. Please try again.");
        return;
      }
    }
    setRequests((current) => current.filter((item) => item.id !== id));
  };
  return (
    <div className="page">
      <div className="page-heading">
        <p className="eyebrow">Manager queue</p>
        <h1>Requests waiting for review.</h1>
        <p>Approve routine items or return them with a note when something needs clarification.</p>
      </div>
      <div className="queue-summary">
        <div><Clock3 size={20} /><span><strong>{requests.length}</strong> waiting</span></div>
        <div><Check size={20} /><span><strong>8</strong> completed this week</span></div>
      </div>
      {message && <p className="inline-message">{message}</p>}
      <section className="approval-list">
        {loading ? (
          <div className="empty-card"><Clock3 size={26} /><h2>Loading requests…</h2></div>
        ) : requests.length === 0 ? (
          <div className="empty-card"><Check size={26} /><h2>You’re all caught up.</h2><p>There are no requests waiting for {profile.fullName}.</p></div>
        ) : requests.map((request) => {
          const Icon = request.icon;
          return (
            <article className="approval-card" key={request.id}>
              <span className="approval-icon"><Icon size={22} /></span>
              <div className="approval-copy">
                <p className="eyebrow">{request.type}</p>
                <h2>{request.person}</h2>
                <p>{request.detail}</p>
                <time>{request.date}</time>
              </div>
              <div className="approval-actions">
                <button className="button secondary" onClick={() => resolve(request.id, "returned")}><X size={17} /> Return</button>
                <button className="button primary" onClick={() => resolve(request.id, "approved")}><Check size={17} /> Approve</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
