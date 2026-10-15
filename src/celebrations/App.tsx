import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Plus,
  Play,
  ShieldCheck,
  LogOut,
  ImagePlus,
  Check,
  Clock,
  Link as LinkIcon,
  ArrowLeft,
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import type { Profile } from "../types";
import Login from "../components/Login";
import CaptionCanvas from "./CaptionCanvas";
import CelebrationTV from "./TV";
import {
  fonts,
  defaultStyle,
  readStyle,
  type CaptionStyle,
} from "./caption-style";
import {
  canUseCelebrations,
  canApprove,
  isLive,
  loopSeconds,
  categories,
  feedUrl,
  type Celebration,
} from "./model";
import {
  loadCelebrations,
  submitCelebration,
  designCelebration,
  setStatus,
  createPlaybackKey,
  projectUrl,
} from "./api";
import "./celebrations.css";
type Store = { id: string; name: string };
type Key = { id: string; label: string; active: boolean; created_at: string };
export default function CelebrationApp() {
  const isTV =
    location.pathname === "/tv" || location.pathname === "/celebrations/tv";
  return isTV ? <CelebrationTV /> : <Workspace />;
}
function Workspace() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [signedIn, setSignedIn] = useState(false),
    [loading, setLoading] = useState(true),
    [items, setItems] = useState<Celebration[]>([]),
    [stores, setStores] = useState<Store[]>([]),
    [assigned, setAssigned] = useState<string[]>([]);
  const [tab, setTab] = useState("feed"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [now, setNow] = useState(Date.now()),
    [queue, setQueue] = useState("pending");
  const [editing, setEditing] = useState<Celebration | null>(null),
    [caption, setCaption] = useState(""),
    [style, setStyle] = useState<CaptionStyle>(defaultStyle),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [store, setStore] = useState(""),
    [category, setCategory] = useState(categories[0]);
  const [keys, setKeys] = useState<Key[]>([]),
    [newKey, setNewKey] = useState(""),
    [keyLabel, setKeyLabel] = useState("Celebration TVs");
  const authGeneration = useRef(0);
  const approver = canApprove(profile);
  const dashUrl =
    import.meta.env.VITE_DASH_OS_URL ||
    (location.hostname !== "celebrations.powerspizza.com"
      ? location.origin
      : null);
  const load = useCallback(async () => {
    const data = await loadCelebrations();
    setItems(data);
  }, []);
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const db = supabase;
    let alive = true;
    async function auth(user?: { id: string; email?: string }) {
      const generation = ++authGeneration.current;
      setSignedIn(!!user);
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await db
          .from("profiles")
          .select("id,email,full_name,role,active,store_id,location")
          .eq("id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!alive || generation !== authGeneration.current) return;
        const p = data
          ? ({
              id: data.id,
              email: data.email,
              fullName: data.full_name,
              role: data.role,
              active: data.active,
              storeId: data.store_id,
              location: data.location,
            } as Profile)
          : null;
        setProfile(p);
        if (canUseCelebrations(p)) {
          const { data: locations, error: storeError } = await db
            .from("stores")
            .select("id,name")
            .eq("active", true)
            .order("name");
          if (storeError) throw storeError;
          const { data: assignments, error: assignmentError } = await db
            .from("profile_store_assignments")
            .select("store_id")
            .eq("profile_id", user.id);
          if (assignmentError) throw assignmentError;
          if (!alive || generation !== authGeneration.current) return;
          setStores(locations || []);
          setAssigned([
            ...new Set([
              ...(p?.storeId ? [p.storeId] : []),
              ...(assignments || []).map((a) => a.store_id),
            ]),
          ]);
          await load();
        }
      } catch (e) {
        if (alive && generation === authGeneration.current)
          setError((e as Error).message);
      } finally {
        if (alive && generation === authGeneration.current) setLoading(false);
      }
    }
    db.auth.getSession().then(({ data }) => auth(data.session?.user));
    const { data: subscription } = db.auth.onAuthStateChange(
      (_event, session) => {
        queueMicrotask(() => {
          if (alive) void auth(session?.user);
        });
      },
    );
    // Recheck directory membership and role, not only the existing JWT, while open.
    const refresh = setInterval(() => {
      db.auth.getSession().then(({ data }) => auth(data.session?.user));
    }, 60000);
    return () => {
      alive = false;
      authGeneration.current++;
      subscription.subscription.unsubscribe();
      clearInterval(refresh);
    };
  }, [load]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (tab !== "settings" || !approver || !supabase) return;
    supabase
      .from("celebration_playback_keys")
      .select("id,label,active,created_at")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setKeys(data || []);
      });
  }, [tab, approver, newKey]);
  async function run(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    try {
      await work();
      setNotice(message);
      await load();
    } catch (e) {
      setError((e as Error).message || "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function newSubmission() {
    setEditing(null);
    setCaption("");
    setStyle(defaultStyle);
    setFile(null);
    setStore("");
    setTab("submit");
    setError("");
  }
  function edit(item: Celebration) {
    setEditing(item);
    setCaption(item.caption);
    setStyle(readStyle(JSON.stringify(item.caption_style)));
    setFile(null);
    setTab("design");
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!profile) return;
    await run(
      async () => {
        if (editing) await designCelebration(editing, caption.trim(), style);
        else {
          if (!file || !store) throw Error("Choose a photo and your store.");
          await submitCelebration(
            profile.id,
            file,
            store,
            caption.trim(),
            category,
            style,
          );
        }
        setFile(null);
        setTab(editing ? "review" : "feed");
        setEditing(null);
      },
      editing
        ? "Caption design saved. The approval timer is unchanged."
        : "Submitted for approval. Your 30 days begin when approved.",
    );
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Link copied");
    } catch {
      setNotice(value);
    }
  }
  if (loading)
    return (
      <div className="c-loading">
        <Sparkles />
        <h2>Opening Celebrations…</h2>
      </div>
    );
  if (!isSupabaseConfigured)
    return (
      <div className="c-loading">
        <h1>Celebrations needs its shared account connection.</h1>
        <p>
          Configure the same Supabase URL and publishable key used by Dash-OS.
        </p>
      </div>
    );
  if (!signedIn) return <Login />;
  if (!canUseCelebrations(profile))
    return (
      <div className="c-loading">
        <ShieldCheck size={42} />
        <h1>Leadership access required</h1>
        <p>
          Your Dash-OS account must be active with a manager, supervisor, or
          admin role.
        </p>
        <p>GM and AM accounts use Dash-OS’s manager role.</p>
        <button className="c-button" onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  const live = items.filter((i) => isLive(i, now)),
    visible =
      tab === "review"
        ? items.filter((i) =>
            queue === "expired"
              ? i.status === "approved" && !isLive(i, now)
              : queue === "approved"
                ? isLive(i, now)
                : queue === "history"
                  ? ["rejected", "removed"].includes(i.status)
                  : i.status === "pending",
          )
        : tab === "mine"
          ? items.filter((i) => i.submitted_by === profile!.id)
          : live;
  const storeName = (id: string) =>
    stores.find((s) => s.id === id)?.name || "Store";
  const eligible = stores.filter(
    (s) => profile!.role === "admin" || assigned.includes(s.id),
  );
  const siteOrigin =
    location.hostname === "celebrations.powerspizza.com"
      ? location.origin
      : location.origin + "/celebrations";
  return (
    <div className="c-shell">
      <aside className="c-sidebar">
        <a href={siteOrigin} className="c-brand">
          <span>
            <Sparkles />
          </span>
          <b>
            Celebration
            <br />
            Hub
          </b>
        </a>
        <small>THE GOOD STUFF</small>
        <nav>
          <button
            className={tab === "feed" ? "active" : ""}
            onClick={() => setTab("feed")}
          >
            Celebration feed
          </button>
          <button
            className={tab === "submit" ? "active" : ""}
            onClick={newSubmission}
          >
            Share a moment
          </button>
          <button
            className={tab === "mine" ? "active" : ""}
            onClick={() => setTab("mine")}
          >
            My submissions
          </button>
          {(approver || profile!.role === "supervisor") && (
            <button
              className={tab === "review" ? "active" : ""}
              onClick={() => setTab("review")}
            >
              {approver ? "Approval queue" : "Store submissions"}
            </button>
          )}
          {approver && (
            <button
              className={tab === "settings" ? "active" : ""}
              onClick={() => setTab("settings")}
            >
              TV playback links
            </button>
          )}
        </nav>
        {dashUrl && (
          <a className="c-dashLink" href={dashUrl}>
            <ArrowLeft size={15} />
            Back to Dash-OS
          </a>
        )}
        <div className="c-user">
          <b>{profile!.fullName}</b>
          <small>
            {profile!.role} · {profile!.location}
          </small>
          <button onClick={() => supabase?.auth.signOut()}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="c-main">
        <header>
          <span>Team Powers / Celebrations</span>
          <span>
            <i /> Good things happen here
          </span>
        </header>
        <div className="c-content">
          {error && (
            <div className="c-error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          {notice && (
            <div className="c-notice" role="status">
              {notice}
              <button onClick={() => setNotice("")}>Dismiss</button>
            </div>
          )}
          {tab === "feed" && (
            <>
              <section className="c-hero">
                <div>
                  <small>THE CELEBRATION WALL</small>
                  <h1>
                    People worth
                    <br />
                    <em>celebrating.</em>
                  </h1>
                  <p>
                    Big wins. Everyday magic.
                    <br />
                    The people who make it all happen.
                  </p>
                  <button className="c-button" onClick={newSubmission}>
                    <Plus size={18} />
                    Share a moment
                  </button>
                </div>
                <div className="c-heroArt" aria-hidden="true">
                  ✦
                  <span>
                    HERE’S TO
                    <br />
                    THE GOOD.
                  </span>
                </div>
              </section>
              <div className="c-stats">
                <div>
                  <b>{live.length}</b>
                  <span>Live celebrations</span>
                </div>
                <div>
                  <b>{loopSeconds(items, now)}s</b>
                  <span>Current TV loop · 10s per photo</span>
                </div>
                <div>
                  <b>30 days</b>
                  <span>From approval to archive</span>
                </div>
              </div>
              <h2>Moments that matter</h2>
            </>
          )}
          {(tab === "submit" || tab === "design") && (
            <>
              <div className="c-title">
                <small>MAKE SOMEONE’S DAY</small>
                <h1>
                  {editing ? "Design this moment." : "Share a little good."}
                </h1>
                <p>
                  Style your caption and drag the text into place. The TV
                  receives the finished slide exactly as you design it.
                </p>
              </div>
              <form onSubmit={save} className="c-form">
                {!editing && (
                  <>
                    <label className="c-upload">
                      <ImagePlus />
                      <b>Choose a celebration photo</b>
                      <span>JPG, PNG, or WebP · Up to 10 MB</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        required
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (
                            f &&
                            f.size <= 10 * 1024 * 1024 &&
                            ["image/jpeg", "image/png", "image/webp"].includes(
                              f.type,
                            )
                          )
                            setFile(f);
                          else {
                            setFile(null);
                            setError("Choose a supported photo up to 10 MB.");
                          }
                        }}
                      />
                    </label>
                    <div className="c-fields">
                      <label>
                        Store
                        <select
                          required
                          value={store}
                          onChange={(e) => setStore(e.target.value)}
                        >
                          <option value="">Choose your store</option>
                          {eligible.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Celebration
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          {categories.map((c) => (
                            <option key={c}>{c}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {eligible.length === 0 && (
                      <p className="c-error">
                        No stores are assigned to this account. Ask your Dash-OS
                        admin to add a store assignment.
                      </p>
                    )}
                  </>
                )}
                {(preview || editing?.originalUrl) && (
                  <CaptionCanvas
                    src={preview || editing!.originalUrl!}
                    caption={caption || "Your celebration caption"}
                    style={style}
                    onChange={setStyle}
                  />
                )}
                {editing && !editing.originalUrl && (
                  <p className="c-error">
                    Original photo could not load. Refresh before editing.
                  </p>
                )}
                <label>
                  Caption
                  <textarea
                    required
                    maxLength={500}
                    rows={3}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Who deserves a shout-out? What made this moment special?"
                  />
                </label>
                <div className="c-fields c-styleFields">
                  <label>
                    Font
                    <select
                      value={style.font}
                      onChange={(e) =>
                        setStyle({
                          ...style,
                          font: e.target.value as CaptionStyle["font"],
                        })
                      }
                    >
                      {Object.entries(fonts).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Size
                    <input
                      type="range"
                      min="1.5"
                      max="7"
                      step=".1"
                      value={style.size}
                      onChange={(e) =>
                        setStyle({ ...style, size: +e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Color
                    <input
                      type="color"
                      value={style.color}
                      onChange={(e) =>
                        setStyle({ ...style, color: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Alignment
                    <select
                      value={style.align}
                      onChange={(e) =>
                        setStyle({
                          ...style,
                          align: e.target.value as CaptionStyle["align"],
                        })
                      }
                    >
                      <option>left</option>
                      <option>center</option>
                      <option>right</option>
                    </select>
                  </label>
                  <label>
                    Box width
                    <input
                      type="range"
                      min="25"
                      max="95"
                      value={style.width}
                      onChange={(e) => {
                        const width = +e.target.value;
                        setStyle({
                          ...style,
                          width,
                          x: Math.min(style.x, 100 - width),
                        });
                      }}
                    />
                  </label>
                  <label>
                    Horizontal position
                    <input
                      type="range"
                      min="0"
                      max={100 - style.width}
                      step=".1"
                      value={style.x}
                      onChange={(e) =>
                        setStyle({ ...style, x: +e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Vertical position
                    <input
                      type="range"
                      min="0"
                      max="85"
                      step=".1"
                      value={style.y}
                      onChange={(e) =>
                        setStyle({ ...style, y: +e.target.value })
                      }
                    />
                  </label>
                  <label className="c-check">
                    <input
                      type="checkbox"
                      checked={style.background}
                      onChange={(e) =>
                        setStyle({ ...style, background: e.target.checked })
                      }
                    />
                    Dark backing
                  </label>
                </div>
                <p className="c-hint">
                  Use a photo the people pictured are happy to share with the
                  team. Captions must fit on the slide before saving.
                </p>
                <button
                  type="submit"
                  className="c-button"
                  disabled={busy || (!editing && eligible.length === 0)}
                >
                  {busy
                    ? "Saving…"
                    : editing
                      ? "Save caption design"
                      : "Send for approval"}
                  <Check size={16} />
                </button>
              </form>
            </>
          )}
          {tab === "review" && (
            <>
              <div className="c-title">
                <small>A LITTLE RECOGNITION GOES A LONG WAY</small>
                <h1>Ready for the spotlight.</h1>
                <p>
                  {approver
                    ? "Approve a celebration to start its 30 days on the wall."
                    : "View submissions from your assigned stores. Delaney approves publication."}
                </p>
              </div>
              <div className="c-tabs">
                {[
                  ["pending", "Awaiting approval"],
                  ["approved", "Live"],
                  ["expired", "Expired"],
                  ["history", "History"],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    className={queue === v ? "active" : ""}
                    onClick={() => setQueue(v)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </>
          )}
          {tab === "mine" && (
            <div className="c-title">
              <h1>Your moments.</h1>
              <p>
                Track what you’ve shared and see which celebrations are live.
              </p>
            </div>
          )}
          {["feed", "mine", "review"].includes(tab) &&
            (visible.length ? (
              <div className="c-grid">
                {visible.map((item) => (
                  <article className="c-card" key={item.id}>
                    {item.imageUrl ? (
                      <a href={item.imageUrl} target="_blank" rel="noreferrer">
                        <img src={item.imageUrl} alt={item.caption} />
                      </a>
                    ) : (
                      <div className="c-missing">Preview unavailable</div>
                    )}
                    <div>
                      <span className="c-store">
                        {storeName(item.store_id)} · {item.category}
                      </span>
                      <h3>{item.caption}</h3>
                      <p className="c-status">
                        <Clock size={13} />
                        {isLive(item, now)
                          ? `Live until ${new Date(item.expires_at!).toLocaleDateString()}`
                          : item.status === "approved"
                            ? "Archived after 30 days"
                            : item.status}
                      </p>
                      {approver && (
                        <div className="c-actions">
                          {item.status === "pending" && (
                            <>
                              <button
                                className="c-button"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () => setStatus(item, "approved"),
                                    "Approved for 30 days.",
                                  )
                                }
                              >
                                <Check size={15} />
                                Approve
                              </button>
                              <button
                                className="c-outline"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () => setStatus(item, "rejected"),
                                    "Submission declined.",
                                  )
                                }
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {isLive(item, now) && (
                            <button
                              className="c-outline"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  confirm(
                                    "Remove this celebration from the display?",
                                  )
                                )
                                  run(
                                    () => setStatus(item, "removed"),
                                    "Removed from playback.",
                                  );
                              }}
                            >
                              Remove
                            </button>
                          )}
                          <button
                            className="c-link"
                            disabled={busy}
                            onClick={() => edit(item)}
                          >
                            Design caption
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="c-empty">
                <Sparkles size={40} />
                <h2>
                  {tab === "feed"
                    ? "Every celebration starts with a moment."
                    : "All caught up."}
                </h2>
                <p>
                  {tab === "feed"
                    ? "Share a photo and a few words. Approved moments will appear here."
                    : "Submissions will appear here when available."}
                </p>
              </div>
            ))}
          {tab === "settings" && approver && (
            <>
              <div className="c-title">
                <small>READY FOR THE BIG SCREEN</small>
                <h1>Keep the good news rolling.</h1>
                <p>
                  Use Media RSS in Label King Turbo first. Each finished slide
                  declares 10 seconds. Confirm that your player honors that
                  setting and refreshes the feed.
                </p>
              </div>
              <div className="c-settings">
                <h2>
                  {live.length} live slides · {live.length * 10} seconds per
                  loop
                </h2>
                <p>
                  The playback link shows only approved, unexpired slides.
                  Anyone holding it can view those slides; it grants no upload
                  or approval access.
                </p>
                <label>
                  Playback link name
                  <input
                    value={keyLabel}
                    maxLength={80}
                    onChange={(e) => setKeyLabel(e.target.value)}
                  />
                </label>
                <button
                  className="c-button"
                  disabled={busy || !keyLabel.trim()}
                  onClick={() =>
                    run(
                      async () =>
                        setNewKey(
                          await createPlaybackKey(keyLabel.trim(), profile!.id),
                        ),
                      "Playback key created. Copy the link now; it cannot be retrieved later.",
                    )
                  }
                >
                  <LinkIcon size={16} />
                  Create playback link
                </button>
                {newKey && (
                  <div className="c-keyResult">
                    <b>Save these links now</b>
                    <label>
                      Media RSS
                      <input readOnly value={feedUrl(projectUrl(), newKey)} />
                    </label>
                    <button
                      className="c-outline"
                      onClick={() => copy(feedUrl(projectUrl(), newKey))}
                    >
                      Copy Media RSS link
                    </button>
                    <label>
                      Web Page fallback
                      <input
                        readOnly
                        value={siteOrigin + "/tv#key=" + newKey}
                      />
                    </label>
                    <button
                      className="c-outline"
                      onClick={() => copy(siteOrigin + "/tv#key=" + newKey)}
                    >
                      Copy TV web link
                    </button>
                    <p>
                      Links stay active until revoked below. Caption edits
                      update the feed. Expired slides disappear on the player’s
                      next feed refresh; downloaded copies may remain in its
                      cache.
                    </p>
                  </div>
                )}
                <h3>Playback links</h3>
                {keys.length === 0 && <p>No playback links yet.</p>}
                {keys.map((k) => (
                  <div className="c-keyRow" key={k.id}>
                    <span>
                      {k.label}
                      <small>
                        {k.active ? "Active" : "Revoked"} ·{" "}
                        {new Date(k.created_at).toLocaleDateString()}
                      </small>
                    </span>
                    {k.active && (
                      <button
                        className="c-outline"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              "Revoke this playback link? TVs using it will stop receiving slides.",
                            )
                          )
                            run(async () => {
                              const { error } = await supabase!
                                .from("celebration_playback_keys")
                                .update({ active: false })
                                .eq("id", k.id);
                              if (error) throw error;
                              setKeys(
                                keys.map((x) =>
                                  x.id === k.id ? { ...x, active: false } : x,
                                ),
                              );
                              setNewKey("");
                            }, "Playback link revoked.");
                        }}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          <footer>
            Thoughtfully shared. Personally approved. Celebrated for 30 days.
          </footer>
        </div>
      </main>
    </div>
  );
}
