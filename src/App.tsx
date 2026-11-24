import { useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Gauge,
  CalendarClock,
  CalendarDays,
  ExternalLink,
  UploadCloud,
  Home,
  LogOut,
  Menu,
  Package,
  PartyPopper,
  Settings,
  ShoppingBag,
  Wrench,
  MonitorCog,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Shirt,
  Users,
  X,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { demoProfile } from "./data/demo";
import type { PortalSection, Profile, Role } from "./types";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Uniforms from "./components/Uniforms";
import Receipts from "./components/Receipts";
import Approvals from "./components/Approvals";
import Reconciliation from "./components/Reconciliation";
import Team from "./components/Team";
import CatalogAdmin from "./components/CatalogAdmin";
import SupportTickets from "./components/SupportTickets";
import KPITracker from "./components/KPITracker";
import LaborManagement from "./components/LaborManagement";
import ReportImportCenter from "./components/ReportImportCenter";
import HumanResources from "./components/HumanResources";
import PayrollCenter from "./components/PayrollCenter";
import OperationsCalendar from "./components/OperationsCalendar";
import SupervisorVisitLog from "./components/SupervisorVisitLog";
import AreaSupervisorDashboard from "./components/AreaSupervisorDashboard";
import TeamEvaluations from "./components/TeamEvaluations";
import TeamMemberPortal, { type MemberAccess } from "./components/TeamMemberPortal";

const navigation: {
  id: PortalSection;
  label: string;
  icon: typeof Home;
  roles?: Role[];
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "kpi", label: "KPI Dashboard", icon: Gauge },
  { id: "labor", label: "Smart Scheduler", icon: CalendarClock, roles: ["manager", "supervisor", "admin"] },
  { id: "calendar", label: "Team Calendar", icon: CalendarDays },
  { id: "supervisor-dashboard", label: "Area Supervisor Dashboard", icon: ClipboardCheck, roles: ["supervisor", "admin"] },
  { id: "receipts", label: "Company Credit Charges", icon: Receipt, roles: ["supervisor", "admin"] },
  { id: "hr", label: "HR Action Logs", icon: ShieldAlert, roles: ["manager", "supervisor", "admin"] },
  { id: "evaluations", label: "Team Evaluations", icon: ClipboardCheck, roles: ["manager", "supervisor", "admin"] },
  { id: "payroll", label: "Payroll Submission", icon: CreditCard, roles: ["manager", "supervisor", "admin"] },
  { id: "technology", label: "Technology Requests", icon: MonitorCog },
  { id: "maintenance", label: "Maintenance Requests", icon: Wrench },
  { id: "smallwares", label: "Smallwares Requests", icon: ShoppingBag },
  { id: "uniforms", label: "Store Uniform Requests", icon: Package },
  { id: "imports", label: "Weekly Data Imports", icon: UploadCloud, roles: ["supervisor", "admin"] },
  { id: "team", label: "Team Access", icon: Users, roles: ["admin"] },
  {
    id: "approvals",
    label: "Approvals",
    icon: ClipboardCheck,
    roles: ["employee", "supervisor", "manager", "accounting", "admin"],
  },
  {
    id: "reconciliation",
    label: "Reconciliation",
    icon: CreditCard,
    roles: ["accounting", "admin"],
  },
  { id: "catalog", label: "Catalog Management", icon: Settings, roles: ["admin"] },
];

const externalSites = [
  { label: "Celebrations", href: "https://celebrations.powerspizza.com", icon: PartyPopper },
  { label: "Individual Uniforms", href: "https://uniforms.powerspizza.com", icon: Shirt },
];

type RequestBadgeSection = "technology" | "maintenance" | "approvals" | "kpi";
type RequestBadges = Partial<Record<RequestBadgeSection, number>>;

async function loadProfile(userId: string, email: string): Promise<Profile | null> {
  if (!supabase) return demoProfile;
  const { data, error } = await supabase
    .rpc("portal_current_profile")
    .maybeSingle();
  const row = data as {
    id: string; email: string | null; full_name: string | null; role: Role;
    location: string | null; active: boolean; store_id: string | null; permissions: string[] | null;
  } | null;

  if (error || !row || !row.active || row.id !== userId) return null;

  return {
    id: row.id,
    email: row.email ?? email,
    fullName: row.full_name ?? email.split("@")[0],
    role: row.role,
    location: row.location ?? "",
    active: row.active,
    storeId: row.store_id,
    permissions: row.permissions ?? [],
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(
    isSupabaseConfigured ? null : demoProfile,
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const resolvedAccount = useRef<string | null>(null);
  const [memberAccess, setMemberAccess] = useState<MemberAccess | null>(null);
  const [section, setSection] = useState<PortalSection>("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [recentSections, setRecentSections] = useState<PortalSection[]>([]);
  const [requestBadges, setRequestBadges] = useState<RequestBadges>({});
  const restoredProfileId = useRef<string | null>(null);
  const authRequestId = useRef(0);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    client.auth.getSession().then(async ({ data }) => {
      const request = ++authRequestId.current;
      if (!active) return;
      if (data.session?.user) {
        // Browser storage can outlive a revoked server session. Verify it
        // before rendering tools that require server-side authorization.
        const verified = await client.auth.getUser();
        if (verified.error || !verified.data.user) {
          await client.auth.signOut({ scope: "local" });
          if (!active || request !== authRequestId.current) return;
          setSession(null);
          setProfile(null);
          setLoading(false);
          return;
        }
        const resolvedProfile = await loadProfile(verified.data.user.id, verified.data.user.email ?? "")
          ?? await new Promise<Profile | null>((resolve) => window.setTimeout(() => void loadProfile(verified.data.user.id, verified.data.user.email ?? "").then(resolve), 250));
        if (!active || request !== authRequestId.current) return;
        setSession(data.session);
        setProfile(resolvedProfile);
        resolvedAccount.current = resolvedProfile?.id ?? null;
        if (!resolvedProfile) {
          const memberResult = await client.rpc("team_member_portal_action", { action: "session", payload: {} });
          if (!active || request !== authRequestId.current) return;
          setMemberAccess(memberResult.error ? null : memberResult.data?.member ?? null);
        } else setMemberAccess(null);
      } else {
        if (request !== authRequestId.current) return;
        setSession(null);
        setProfile(null);
        setMemberAccess(null);
      }
      setLoading(false);
    });

    const { data: listener } = client.auth.onAuthStateChange(
      (event, nextSession) => {
        if (event === "INITIAL_SESSION") return;
        const request = ++authRequestId.current;
        setSession(nextSession);
        if (!nextSession?.user) {
          resolvedAccount.current = null;
          setProfile(null);
          setMemberAccess(null);
          setLoading(false);
          return;
        }
        if (nextSession.user.id !== resolvedAccount.current) setLoading(true);
        // Keep the auth callback synchronous. Supabase serializes auth events;
        // awaiting another Supabase call inside this callback can race a newer event.
        void (async () => {
          const user = nextSession.user;
          const resolvedProfile = await loadProfile(user.id, user.email ?? "")
            ?? await new Promise<Profile | null>((resolve) => window.setTimeout(() => void loadProfile(user.id, user.email ?? "").then(resolve), 250));
          if (!active || request !== authRequestId.current) return;
          setProfile(resolvedProfile);
          resolvedAccount.current = resolvedProfile?.id ?? null;
          if (!resolvedProfile) {
            const memberResult = await client.rpc("team_member_portal_action", { action: "session", payload: {} });
            if (!active || request !== authRequestId.current) return;
            setMemberAccess(memberResult.error ? null : memberResult.data?.member ?? null);
          } else setMemberAccess(null);
          setLoading(false);
        })();
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const visibleNavigation = useMemo(
    () =>
      navigation.filter((item) => {
        if (!profile) return false;
        if (item.id === "kpi") {
          return profile.role === "admin" || profile.role === "supervisor" ||
            profile.permissions?.includes("kpi_view") ||
            profile.permissions?.includes("kpi_view_all");
        }
        return !item.roles || item.roles.includes(profile.role);
      }),
    [profile],
  );

  useEffect(() => {
    if (!supabase || !profile) {
      setRequestBadges({});
      return;
    }

    const client = supabase;
    let active = true;
    const loadRequestBadges = async () => {
      const capabilities = await client
        .from("profile_capabilities")
        .select("capability")
        .eq("profile_id", profile.id);
      const assigned = new Set((capabilities.data ?? []).map((item: { capability: string }) => item.capability));
      const canRespondTechnology = profile.role === "admin" || assigned.has("technology");
      const canRespondMaintenance = profile.role === "admin" || assigned.has("maintenance");
      const canReviewOrders = ["supervisor", "accounting", "admin"].includes(profile.role);

      const [technology, maintenance, approvals, kpiFollowup] = await Promise.all([
        canRespondTechnology
          ? client.from("support_tickets").select("id", { count: "exact", head: true }).eq("area", "technology").neq("status", "completed")
          : Promise.resolve({ count: null }),
        canRespondMaintenance
          ? client.from("support_tickets").select("id", { count: "exact", head: true }).eq("area", "maintenance").neq("status", "completed")
          : Promise.resolve({ count: null }),
        canReviewOrders
          ? client.from("portal_orders").select("id", { count: "exact", head: true }).in("category", ["smallware", "uniform"]).eq("status", "submitted")
          : Promise.resolve({ count: null }),
        ["admin", "supervisor"].includes(profile.role)
          ? client.functions.invoke("kpi-plans", { body: { action: "list" } })
          : Promise.resolve({ data: null }),
      ]);

      if (!active) return;
      setRequestBadges({
        ...(canRespondTechnology ? { technology: technology.count ?? 0 } : {}),
        ...(canRespondMaintenance ? { maintenance: maintenance.count ?? 0 } : {}),
        ...(canReviewOrders ? { approvals: approvals.count ?? 0 } : {}),
        ...(["admin", "supervisor"].includes(profile.role) ? { kpi: (kpiFollowup.data?.plans ?? []).filter((plan: { status: string; actions: Array<{ status: string }> }) => plan.status === "released" && plan.actions.some((action) => action.status !== "done")).length } : {}),
      });
    };

    const refresh = () => void loadRequestBadges();
    void loadRequestBadges();
    window.addEventListener("dashos:requests-changed", refresh);
    window.addEventListener("dashos:kpi-followup-changed", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    const channel = client
      .channel(`request-badges-${profile.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_orders" }, refresh)
      .subscribe();

    return () => {
      active = false;
      window.removeEventListener("dashos:requests-changed", refresh);
      window.removeEventListener("dashos:kpi-followup-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [profile]);

  useEffect(() => {
    if (!profile || restoredProfileId.current === profile.id) return;
    restoredProfileId.current = profile.id;
    const recentKey = `dashos:recent-sections:${profile.id}`;
    const lastKey = `dashos:last-section:${profile.id}`;
    try {
      const storedRecent = JSON.parse(window.localStorage.getItem(recentKey) ?? "[]") as PortalSection[];
      const allowed = new Set(visibleNavigation.map((item) => item.id));
      setRecentSections(storedRecent.filter((item) => item !== "home" && allowed.has(item)).slice(0, 8));
      const storedLast = window.localStorage.getItem(lastKey) as PortalSection | null;
      setSection(storedLast && storedLast !== "home" && allowed.has(storedLast) ? storedLast : "home");
    } catch {
      setRecentSections([]);
      setSection("home");
    }
  }, [profile, visibleNavigation]);

  const signOut = async () => {
    authRequestId.current += 1;
    if (supabase) await supabase.auth.signOut();
    restoredProfileId.current = null;
    setSection("home");
    setRecentSections([]);
    setProfile(null);
    setMemberAccess(null);
    setSession(null);
  };

  if (loading) {
    return (
      <main className="center-screen">
        <img
          className="brand-logo compact"
          src="/dash-sos-logo.png"
          alt="Dash-OS"
        />
        <p>Opening your portal…</p>
      </main>
    );
  }

  if (isSupabaseConfigured && !session) return <Login />;

  if (memberAccess) return <TeamMemberPortal member={memberAccess} onSignOut={signOut} onAccessRevoked={()=>{setMemberAccess(null);void signOut();}} />;

  if (!profile) {
    return (
      <main className="center-screen access-message">
        <ShieldCheck size={42} />
        <h1>Access isn’t active yet</h1>
        <p>
          Your email is verified, but an administrator must add it to the
          Dash-OS team directory before you can enter.
        </p>
        <button className="button secondary" onClick={signOut}>
          Sign out
        </button>
      </main>
    );
  }

  const selectSection = (next: PortalSection) => {
    setSection(next);
    setMenuOpen(false);
    if (next !== "home") {
      const recentKey = `dashos:recent-sections:${profile.id}`;
      const lastKey = `dashos:last-section:${profile.id}`;
      window.localStorage.setItem(lastKey, next);
      setRecentSections((current) => {
        const updated = [next, ...current.filter((item) => item !== next)].slice(0, 8);
        window.localStorage.setItem(recentKey, JSON.stringify(updated));
        return updated;
      });
    }
  };

  const content = {
    home: <Dashboard profile={profile} onNavigate={selectSection} availableSections={visibleNavigation.map((item) => item.id)} recentSections={recentSections} />,
    payroll: <PayrollCenter profile={profile} />,
    kpi: <KPITracker profile={profile} />,
    labor: <LaborManagement profile={profile} />,
    calendar: <OperationsCalendar profile={profile} onOpenVisitLog={(scheduleId)=>{window.sessionStorage.setItem('dashos:visit-schedule',scheduleId);window.sessionStorage.setItem('dashos:supervisor-workspace-view','visits');selectSection('supervisor-dashboard');}} />,
    "supervisor-dashboard": <AreaSupervisorDashboard profile={profile} />,
    "visit-log": <SupervisorVisitLog profile={profile} initialScheduleId={window.sessionStorage.getItem('dashos:visit-schedule')} />,
    hr: <HumanResources profile={profile} />,
    evaluations: <TeamEvaluations profile={profile} />,
    imports: <ReportImportCenter profile={profile} />,
    uniforms: <Uniforms profile={profile} />,
    smallwares: <Uniforms profile={profile} category="smallware" />,
    maintenance: <SupportTickets profile={profile} area="maintenance" />,
    technology: <SupportTickets profile={profile} area="technology" />,
    receipts: <Receipts profile={profile} />,
    approvals: <Approvals profile={profile} />,
    reconciliation: <Reconciliation />,
    team: <Team currentProfile={profile} />,
    catalog: <CatalogAdmin profile={profile} />,
  }[section];

  return (
    <div className={`app-shell ${menuOpen ? "nav-expanded" : "nav-collapsed"}`}>
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <button className="sidebar-logo-button" aria-label={menuOpen ? "Collapse navigation" : "Expand navigation"} title={menuOpen ? "Collapse navigation" : "Open navigation"} onClick={() => setMenuOpen((current) => !current)}>
            <img src="/dash-sos-logo.png" alt="Dash-OS navigation" />
          </button>
          <button
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMenuOpen(false)}
          >
            <X size={21} />
          </button>
        </div>

        <nav aria-label="Portal navigation">
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            const badge = requestBadges[item.id as RequestBadgeSection];
            return (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => selectSection(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                {typeof badge === "number" && badge > 0 && (
                  <span className={`nav-request-badge badge-${item.id}`} aria-label={`${badge} open requests`}>
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
                <ChevronRight className="nav-arrow" size={16} />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-external-sites" aria-label="Team Powers websites">
          <small>Team Powers sites</small>
          {externalSites.map((site) => {
            const Icon = site.icon;
            return <a key={site.href} href={site.href} target="_blank" rel="noreferrer"><Icon size={17}/><span>{site.label}</span><ExternalLink size={14}/></a>;
          })}
        </div>

        <a className="sidebar-support" href="mailto:daustin@powerspizza.com?subject=Dash-OS%20support">
          <span>Support or suggestions</span>
          <small>daustin@powerspizza.com</small>
        </a>

        <div className="sidebar-user">
          <div className="avatar">{profile.fullName.slice(0, 1)}</div>
          <div>
            <strong>{profile.fullName}</strong>
            <span>{profile.role === "supervisor" ? "Area Supervisor" : profile.role === "admin" ? "Administrator" : profile.role.charAt(0).toUpperCase() + profile.role.slice(1)} · {profile.location}</span>
          </div>
          <button className="icon-button" aria-label="Sign out" onClick={signOut}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <main className="portal-main">
        <header className="mobile-header">
          <button
            className="icon-button"
            aria-label="Open navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={23} />
          </button>
          <span className="mobile-brand">
            <img src="/dash-sos-logo.png" alt="" />
            <strong>Dash-OS</strong>
          </span>
          <CheckCircle2 size={21} />
        </header>
        {content}
      </main>
    </div>
  );
}
