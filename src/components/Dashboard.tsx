import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardCheck,
  Package,
  Receipt,
  Wrench,
  MonitorCog,
} from "lucide-react";
import { recentActivity } from "../data/demo";
import type { ActivityItem, PortalSection, Profile } from "../types";
import { supabase } from "../lib/supabase";

type LiveActivity = ActivityItem & { section: PortalSection; timestamp: string };

function activityStatus(status: string): ActivityItem["status"] {
  const normalized = status.toLowerCase();
  if (["approved", "ordered", "complete", "completed", "matched"].includes(normalized)) return "Complete";
  if (["returned", "rejected", "denied", "needs_review", "partially_approved"].includes(normalized)) return "Needs attention";
  return "Pending";
}

function relativeDate(timestamp: string) {
  const date = new Date(timestamp);
  const elapsedDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (elapsedDays <= 0) return "Today";
  if (elapsedDays === 1) return "Yesterday";
  if (elapsedDays < 7) return `${elapsedDays} days ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function Dashboard({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (section: PortalSection) => void;
}) {
  const [activity, setActivity] = useState<LiveActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(Boolean(supabase));
  const firstName = profile.fullName.split(" ")[0];
  const today = new Date();
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
  }).format(today);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(
    today,
  );

  useEffect(() => {
    let active = true;
    const client = supabase;
    const loadActivity = async () => {
      if (!client) {
        setActivity(recentActivity.map((item) => ({ ...item, section: "approvals", timestamp: new Date().toISOString() })));
        setActivityLoading(false);
        return;
      }
      const [orders, receipts, tickets] = await Promise.all([
        client.from("portal_orders").select("id,category,total,status,decision,created_at,store_name").order("created_at", { ascending: false }).limit(8),
        client.from("card_receipts").select("id,vendor,amount,status,created_at").order("created_at", { ascending: false }).limit(8),
        client.from("support_tickets").select("id,area,severity,status,created_at,stores(name)").order("created_at", { ascending: false }).limit(8),
      ]);
      if (!active) return;
      const combined: LiveActivity[] = [];
      for (const order of orders.data ?? []) {
        const rawStatus = order.decision || order.status;
        combined.push({ id: `order-${order.id}`, title: order.category === "smallware" ? "Smallwares order" : "Uniform order", detail: `${order.store_name || "Store"} · $${Number(order.total).toFixed(2)}`, status: activityStatus(rawStatus), date: relativeDate(order.created_at), timestamp: order.created_at, section: "approvals" });
      }
      for (const receipt of receipts.data ?? []) {
        combined.push({ id: `receipt-${receipt.id}`, title: "Corporate card receipt", detail: `${receipt.vendor} · $${Number(receipt.amount).toFixed(2)}`, status: activityStatus(receipt.status), date: relativeDate(receipt.created_at), timestamp: receipt.created_at, section: "receipts" });
      }
      for (const ticket of tickets.data ?? []) {
        const store = Array.isArray(ticket.stores) ? ticket.stores[0]?.name : (ticket.stores as { name?: string } | null)?.name;
        combined.push({ id: `ticket-${ticket.id}`, title: ticket.area === "technology" ? "Technology request" : "Maintenance request", detail: `${store || "Store"} · ${ticket.severity} severity`, status: activityStatus(ticket.status), date: relativeDate(ticket.created_at), timestamp: ticket.created_at, section: ticket.area === "technology" ? "technology" : "maintenance" });
      }
      combined.sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
      setActivity(combined.slice(0, 6));
      setActivityLoading(false);
    };
    void loadActivity();
    if (!client) return () => { active = false; };
    const activityChannel = client
      .channel(`dashboard-activity-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_orders" }, () => void loadActivity())
      .on("postgres_changes", { event: "*", schema: "public", table: "card_receipts" }, () => void loadActivity())
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => void loadActivity())
      .subscribe();
    const activityTimer = window.setInterval(() => void loadActivity(), 30000);
    const refreshOnFocus = () => void loadActivity();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      active = false;
      window.clearInterval(activityTimer);
      window.removeEventListener("focus", refreshOnFocus);
      void client.removeChannel(activityChannel);
    };
  }, [profile.id]);
  const actions: {
    title: string;
    detail: string;
    icon: typeof Package;
    section: PortalSection;
    tone: string;
  }[] = [
    {
      title: "Order uniforms",
      detail: "Request shirts, hats, and other approved items.",
      icon: Package,
      section: "uniforms",
      tone: "green",
    },
    {
      title: "Order smallwares",
      detail: "Request approved tools, supplies, and store equipment.",
      icon: Package,
      section: "smallwares",
      tone: "gold",
    },
    {
      title: "Maintenance request",
      detail: "Report a store repair and track its progress.",
      icon: Wrench,
      section: "maintenance",
      tone: "gold",
    },
    {title:"Technology request",detail:"Report a system or equipment issue.",icon:MonitorCog,section:"technology",tone:"blue"},
    {
      title: "Submit a receipt",
      detail: "Upload and categorize a corporate-card purchase.",
      icon: Receipt,
      section: "receipts",
      tone: "blue",
    },
    {
      title: "Review approvals",
      detail: "See requests waiting for your attention.",
      icon: ClipboardCheck,
      section: "approvals",
      tone: "plum",
    },
  ];

  return (
    <div className="page dashboard">
      <section className="welcome">
        <div>
          <p className="eyebrow">Employee portal</p>
          <h1>Good to see you, {firstName}.</h1>
          <p>What would you like to take care of today?</p>
        </div>
        <div
          className="welcome-date"
          aria-label={`${weekday}, ${month} ${today.getDate()}`}
        >
          <span>{weekday}</span>
          <strong>{today.getDate()}</strong>
          <span>{month}</span>
        </div>
      </section>

      <section>
        <div className="section-heading">
          <div>
            <p className="eyebrow">Quick actions</p>
            <h2>Start a request</h2>
          </div>
        </div>
        <div className="action-grid">
          {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  className="action-card"
                  key={action.title}
                  onClick={() => onNavigate(action.section)}
                >
                  <span className={`action-icon ${action.tone}`}>
                    <Icon size={23} />
                  </span>
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.detail}</small>
                  </span>
                  <ArrowRight className="action-arrow" size={19} />
                </button>
              );
            })}
        </div>
      </section>

      <section className="activity-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">At a glance</p>
            <h2>Recent activity</h2>
          </div>
        </div>
        <div className="activity-card">
          {activityLoading ? <div className="activity-empty">Loading recent activity…</div> : activity.length === 0 ? <div className="activity-empty">No submissions yet. Your newest orders, receipts, and support requests will appear here.</div> : activity.map((item) => (
            <button type="button" className="activity-row" key={item.id} onClick={() => onNavigate(item.section)}>
              <span className={`status-dot ${item.status.replace(" ", "-").toLowerCase()}`} />
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              <span className={`status-pill ${item.status.replace(" ", "-").toLowerCase()}`}>
                {item.status}
              </span>
              <time>{item.date}</time>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
