import { useEffect, useState, useRef } from "react";
import { feedUrl } from "./model";
import { projectUrl } from "./api";
type Slide = { id: string; url: string; caption: string; expires_at: string };
export default function CelebrationTV() {
  const [slides, setSlides] = useState<Slide[]>([]),
    [index, setIndex] = useState(0),
    [error, setError] = useState(""),
    [now, setNow] = useState(Date.now());
  const list = useRef<Slide[]>([]),
    position = useRef(0),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let alive = true;
    const token = new URLSearchParams(location.hash.slice(1)).get("key") || "";
    const schedule = () => {
      timer.current = setTimeout(async () => {
        if (!alive) return;
        const count = list.current.filter(
          (i) => Date.parse(i.expires_at) > Date.now(),
        ).length;
        position.current = count ? (position.current + 1) % count : 0;
        setIndex(position.current);
        if (position.current === 0) await refresh();
        if (alive) schedule();
      }, 10000);
    };
    async function refresh() {
      try {
        const r = await fetch(feedUrl(projectUrl(), token, "json"), {
          cache: "no-store",
        });
        if (!r.ok)
          throw Error(
            "The playback link is invalid, revoked, or temporarily unavailable.",
          );
        const data = (await r.json()) as { items: Slide[] };
        if (alive) {
          list.current = data.items;
          setSlides(data.items);
          setError("");
        }
      } catch (e) {
        if (alive) setError((e as Error).message);
      }
    }
    void refresh().then(() => {
      if (alive) schedule();
    });
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      clearInterval(clock);
    };
  }, []);
  const active = slides.filter((i) => Date.parse(i.expires_at) > now),
    slide = active[index % Math.max(active.length, 1)];
  useEffect(() => {
    document.title = `Team Powers Celebrations · ${active.length * 10}s`;
    document.documentElement.dataset.slideshowDuration = String(
      active.length * 10,
    );
  }, [active.length]);
  useEffect(() => {
    if (active.length < 2) return;
    const preload = new Image();
    preload.src = active[(index + 1) % active.length].url;
  }, [slides, index]);
  return (
    <div className="c-tv">
      {slide ? (
        <img src={slide.url} alt={slide.caption} />
      ) : (
        <div>
          <span>✦</span>
          <h1>Good things are on the way.</h1>
          <p>
            {error || "Approved celebrations will play here automatically."}
          </p>
        </div>
      )}
    </div>
  );
}
