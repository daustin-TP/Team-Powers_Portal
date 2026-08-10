import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  Home,
  LogOut,
  Menu,
  Package,
  Receipt,
  ShieldCheck,
  Users,
  WalletCards,
  X,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { demoProfile } from "./data/demo";
import type { PortalSection, Profile, Role } from "./types";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Uniforms from "./components/Uniforms";
import Payroll from "./components/Payroll";
import Receipts from "./components/Receipts";
import Approvals from "./components/Approvals";
import Reconciliation from "./components/Reconciliation";
import Team from "./components/Team";

const navigation: {
  id: PortalSection;
  label: string;
  icon: typeof Home;
  roles?: Role[];
}[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "uniforms", label: "Uniforms", icon: Package },
  { id: "payroll", label: "Payroll authorization", icon: WalletCards },
  { id: "receipts", label: "Card receipts", icon: Receipt },
  {
    id: "approvals",
    label: "Approvals",
    icon: ClipboardCheck,
    roles: ["manager", "accounting", "admin"],
  },
  {
    id: "reconciliation",
    label: "Reconciliation",
    icon: CreditCard,
    roles: ["accounting", "admin"],
  },
  { id: "team", label: "Team access", icon: Users, roles: ["admin"] },
];

async function loadProfile(userId: string, email: string): Promise<Profile | null> {
  if (!supabase) return demoProfile;
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,location,active")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data || !data.active) return null;
  return {
    id: data.id,
    email: data.email ?? email,
    fullName: data.full_name ?? email.split("@")[0],
    role: data.role,
    location: data.location ?? "",
    active: data.active,
  };
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(
    isSupabaseConfigured ? null : demoProfile,
  );
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [section, setSection] = useState<PortalSection>("home");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) {
        setProfile(
          await loadProfile(
            data.session.user.id,
            data.session.user.email ?? "",
          ),
        );
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, nextSession) => {
        setSession(nextSession);
        setProfile(
          nextSession?.user
            ? await loadProfile(
                nextSession.user.id,
                nextSession.user.email ?? "",
              )
            : null,
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const visibleNavigation = useMemo(
    () =>
      navigation.filter(
        (item) => !item.roles || (profile && item.roles.includes(profile.role)),
      ),
    [profile],
  );

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  };

  if (loading) {
    return (
      <main className="center-screen">
        <div className="brand-mark compact">TP</div>
        <p>Opening your portal…</p>
      </main>
    );
  }

  if (isSupabaseConfigured && !session) return <Login />;

  if (!profile) {
    return (
      <main className="center-screen access-message">
        <ShieldCheck size={42} />
        <h1>Access isn’t active yet</h1>
        <p>
          Your email is verified, but an administrator must add it to the Team
          Powers employee directory before you can enter.
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
  };

  const content = {
    home: <Dashboard profile={profile} onNavigate={selectSection} />,
    uniforms: <Uniforms profile={profile} />,
    payroll: <Payroll profile={profile} />,
    receipts: <Receipts profile={profile} />,
    approvals: <Approvals profile={profile} />,
    reconciliation: <Reconciliation />,
    team: <Team />,
  }[section];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="brand-mark">TP</div>
          <div>
            <strong>Team Powers</strong>
            <span>Employee portal</span>
          </div>
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
            return (
              <button
                key={item.id}
                className={section === item.id ? "active" : ""}
                onClick={() => selectSection(item.id)}
              >
                <Icon size={19} />
                <span>{item.label}</span>
                <ChevronRight className="nav-arrow" size={16} />
              </button>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{profile.fullName.slice(0, 1)}</div>
          <div>
            <strong>{profile.fullName}</strong>
            <span>{profile.role} · {profile.location}</span>
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
          <strong>Team Powers</strong>
          <CheckCircle2 size={21} />
        </header>
        {content}
      </main>
    </div>
  );
}
