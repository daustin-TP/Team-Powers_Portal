import {
  ArrowRight,
  ClipboardCheck,
  Package,
  Receipt,
  Wrench,
  MonitorCog,
} from "lucide-react";
import { recentActivity } from "../data/demo";
import type { PortalSection, Profile } from "../types";

export default function Dashboard({
  profile,
  onNavigate,
}: {
  profile: Profile;
  onNavigate: (section: PortalSection) => void;
}) {
  const firstName = profile.fullName.split(" ")[0];
  const today = new Date();
  const weekday = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
  }).format(today);
  const month = new Intl.DateTimeFormat(undefined, { month: "long" }).format(
    today,
  );
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
          {actions
            .filter(
              (action) =>
                action.section !== "approvals" || profile.role !== "employee",
            )
            .map((action) => {
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
          {recentActivity.map((item) => (
            <div className="activity-row" key={item.id}>
              <span className={`status-dot ${item.status.replace(" ", "-").toLowerCase()}`} />
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              <span className={`status-pill ${item.status.replace(" ", "-").toLowerCase()}`}>
                {item.status}
              </span>
              <time>{item.date}</time>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
