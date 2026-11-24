import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CalendarDays, ChevronRight, Pause, Play, RotateCcw, Trophy, Users } from 'lucide-react';
import type { Profile } from '../types';
import { metricValue, rankingMetrics, type RankingKey } from '../../supabase/functions/kpi-dashboard/analytics';
import { kpiDisplay } from './KPITrends';

type HistoryRow = { store_id: string; week_end: string; metrics: Record<string, unknown> };
type RallyStore = { id: string; name: string; store_number: string | null };
type SupervisorGroup = { id: string; name: string; stores: string[]; store_ids?: string[] };
type Cadence = 'week' | 'biweek' | 'period' | 'quarter' | 'half' | 'year' | 'custom';
type Scope = 'region' | 'company' | 'custom' | 'regions' | 'store';
type MetricDetail = { value: number; points: number; rank: number; eligible: number };
type Score = { id: string; name: string; score: number; change: number; opportunity: string; coverage: number; color: string; metrics?: Partial<Record<RankingKey, MetricDetail>> };

const scoreMetrics: RankingKey[] = ['pcya', 'labor', 'splh', 'food', 'load', 'adt'];
const colors = ['#1379d6', '#e43836', '#16a36d', '#8a51d1', '#e69b17', '#008c95', '#d34883', '#5261c9', '#607e18', '#8a5a42', '#266c73', '#76589a'];
const cadenceWeeks: Record<Exclude<Cadence, 'custom'>, number> = { week: 1, biweek: 2, period: 4, quarter: 13, half: 26, year: 52 };
const cadenceLabels: Record<Cadence, string> = { week: 'Weekly', biweek: 'Every 2 weeks', period: '4-week period', quarter: 'Quarter', half: 'Half year', year: 'Year', custom: 'Custom range' };

const iso = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (value: string, days: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + days); return iso(date); };
const shortDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function periodLabel(end: string) {
  const anchor = new Date('2026-11-30T12:00:00');
  const date = new Date(`${end}T12:00:00`);
  const difference = Math.floor((date.getTime() - anchor.getTime()) / 604800000);
  const absolutePeriod = 12 + Math.floor(difference / 4);
  const year = 2026 + Math.floor(absolutePeriod / 13);
  const period = ((absolutePeriod % 13) + 13) % 13 + 1;
  return `P${period} ${year}`;
}

function storeLabel(store: RallyStore) { return store.store_number ? `${store.name} · ${store.store_number}` : store.name; }

export default function KPIPerformanceRally({ profile, history, stores, groups, assignedStores, onOpenPlans }: {
  profile: Profile;
  history: HistoryRow[];
  stores: RallyStore[];
  groups: SupervisorGroup[];
  assignedStores: string[];
  onOpenPlans?: () => void;
}) {
  const leadership = ['admin', 'supervisor'].includes(profile.role);
  const accessibleStores = useMemo(() => leadership ? stores : stores.filter(store => assignedStores.includes(store.id) || assignedStores.includes(store.store_number ?? '')), [assignedStores, leadership, stores]);
  const [scope, setScope] = useState<Scope>(leadership ? 'region' : 'store');
  const [cadence, setCadence] = useState<Cadence>('biweek');
  const [groupId, setGroupId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedScoreId, setSelectedScoreId] = useState('');
  const [zoom, setZoom] = useState(85);
  const [lockedOrder, setLockedOrder] = useState<string[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const previousLanes = useRef<{ order: string; zoom: number; offsets: Map<string, number> } | null>(null);
  const rowAnimations = useRef(new Map<string, Animation>());

  const validGroups = useMemo(() => groups.map(group => ({ ...group, ids: (group.store_ids?.length ? group.store_ids : accessibleStores.filter(store => group.stores.includes(store.id) || group.stores.includes(store.store_number ?? '')).map(store => store.id)).filter(id => accessibleStores.some(store => store.id === id)) })).filter(group => group.ids.length), [accessibleStores, groups]);
  useEffect(() => { if (!groupId && validGroups[0]) setGroupId(validGroups[0].id); }, [groupId, validGroups]);
  useEffect(() => { if (!selectedIds.length && accessibleStores.length) setSelectedIds(accessibleStores.map(store => store.id)); }, [accessibleStores, selectedIds.length]);

  const allWeeks = useMemo(() => [...new Set(history.filter(row => accessibleStores.some(store => store.id === row.store_id)).map(row => row.week_end))].sort(), [accessibleStores, history]);
  useEffect(() => { if (!customStart && allWeeks.length) setCustomStart(allWeeks[0]); if (!customEnd && allWeeks.length) setCustomEnd(allWeeks.at(-1)!); }, [allWeeks, customEnd, customStart]);

  const frames = useMemo(() => {
    if (!allWeeks.length) return [] as { start: string; end: string; weeks: string[] }[];
    if (cadence === 'custom') {
      const weeks = allWeeks.filter(week => (!customStart || week >= customStart) && (!customEnd || week <= customEnd));
      return weeks.map(week => ({ start: week, end: week, weeks: [week] }));
    }
    const size = cadenceWeeks[cadence];
    const result: { start: string; end: string; weeks: string[] }[] = [];
    for (let end = allWeeks.length - 1; end >= 0; end -= size) {
      const slice = allWeeks.slice(Math.max(0, end - size + 1), end + 1);
      if (slice.length) result.unshift({ start: slice[0], end: slice.at(-1)!, weeks: slice });
    }
    return result;
  }, [allWeeks, cadence, customEnd, customStart]);

  useEffect(() => { setFrameIndex(Math.max(0, frames.length - 1)); setPlaying(false); }, [cadence, customEnd, customStart, frames.length]);
  useEffect(() => {
    if (!playing || frames.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex(index => index >= frames.length - 1 ? 0 : index + 1), 1100);
    return () => window.clearInterval(timer);
  }, [frames.length, playing]);

  const scoreFrame = (index: number) => {
    const frame = frames[index];
    if (!frame) return new Map<string, { score: number; opportunity: string; coverage: number; metrics: Partial<Record<RankingKey, MetricDetail>> }>();
    const values = new Map<string, Partial<Record<RankingKey, number>>>();
    for (const store of accessibleStores) {
      const rows = history.filter(row => row.store_id === store.id && frame.weeks.includes(row.week_end));
      const metrics: Partial<Record<RankingKey, number>> = {};
      for (const key of scoreMetrics) {
        const measured = rows.map(row => metricValue(row.metrics, key)).filter((value): value is number => value !== null);
        const result = average(measured);
        if (result !== null) metrics[key] = key === 'food' ? Math.abs(result) : result;
      }
      values.set(store.id, metrics);
    }
    const percentiles = new Map<string, Partial<Record<RankingKey, MetricDetail>>>();
    for (const key of scoreMetrics) {
      const definition = rankingMetrics.find(metric => metric.key === key)!;
      const eligible = accessibleStores.map(store => ({ id: store.id, value: values.get(store.id)?.[key] })).filter((entry): entry is { id: string; value: number } => entry.value !== undefined).sort((a, b) => definition.lower ? b.value - a.value : a.value - b.value);
      eligible.forEach((entry, index) => { const current = percentiles.get(entry.id) ?? {}; current[key] = { value: entry.value, points: eligible.length === 1 ? 100 : index / (eligible.length - 1) * 100, rank: eligible.length - index, eligible: eligible.length }; percentiles.set(entry.id, current); });
    }
    return new Map(accessibleStores.flatMap(store => {
      const entries = Object.entries(percentiles.get(store.id) ?? {}) as [RankingKey, MetricDetail][];
      if (entries.length < 4) return [];
      const lowest = [...entries].sort((a, b) => a[1].points - b[1].points)[0];
      return [[store.id, { score: average(entries.map(([, detail]) => detail.points))!, opportunity: rankingMetrics.find(metric => metric.key === lowest[0])?.label ?? lowest[0], coverage: entries.length, metrics: percentiles.get(store.id) ?? {} }]];
    }));
  };

  const scores = useMemo<Score[]>(() => {
    const current = scoreFrame(frameIndex);
    const previous = scoreFrame(Math.max(0, frameIndex - 1));
    const group = validGroups.find(item => item.id === groupId);
    const custom = selectedIds.filter(id => accessibleStores.some(store => store.id === id));
    const ids = scope === 'region' ? group?.ids ?? [] : scope === 'custom' ? custom : accessibleStores.map(store => store.id);
    const storeScores = ids.flatMap((id, colorIndex) => {
      const store = accessibleStores.find(item => item.id === id); const now = current.get(id); if (!store || !now) return [];
      return [{ id, name: storeLabel(store), score: now.score, change: now.score - (previous.get(id)?.score ?? now.score), opportunity: now.opportunity, coverage: now.coverage, color: colors[colorIndex % colors.length], metrics: now.metrics }];
    });
    if (scope !== 'regions') return storeScores.sort((a, b) => b.score - a.score);
    return validGroups.flatMap((item, index) => {
      const memberNow = item.ids.map(id => current.get(id)?.score).filter((value): value is number => value !== undefined);
      const memberBefore = item.ids.map(id => previous.get(id)?.score).filter((value): value is number => value !== undefined);
      if (!memberNow.length) return [];
      const metricOpportunities = scoreMetrics.map(key => ({ key, count: item.ids.filter(id => current.get(id)?.opportunity === rankingMetrics.find(metric => metric.key === key)?.label).length })).sort((a, b) => b.count - a.count);
      return [{ id: item.id, name: item.name, score: average(memberNow)!, change: average(memberNow)! - (average(memberBefore) ?? average(memberNow)!), opportunity: rankingMetrics.find(metric => metric.key === metricOpportunities[0]?.key)?.label ?? 'Balanced', coverage: item.ids.length, color: colors[index % colors.length] }];
    }).sort((a, b) => b.score - a.score);
  // scoreFrame is intentionally based on the current props and frame state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessibleStores, frameIndex, groupId, scope, selectedIds, validGroups, frames, history]);

  const rankedScores = new Map(scores.map((score, index) => [score.id, { score, rank: index + 1 }]));
  const roster = scope === 'regions' ? validGroups.map(group => group.id)
    : scope === 'region' ? validGroups.find(group => group.id === groupId)?.ids ?? []
    : scope === 'custom' ? selectedIds : accessibleStores.map(store => store.id);
  const lanes = lockedOrder === null ? scores.map(score => score.id)
    : [...lockedOrder.filter(id => roster.includes(id)), ...roster.filter(id => !lockedOrder.includes(id))];
  const laneOrder = JSON.stringify(lanes);
  const trackVisible = scores.length > 0 || (frames.length > 0 && lockedOrder !== null && lanes.length > 0);

  useLayoutEffect(() => {
    const rows = Array.from(trackRef.current?.querySelectorAll<HTMLElement>('[data-rally-lane]') ?? []);
    const offsets = new Map(rows.map(row => [row.dataset.rallyLane!, row.offsetTop]));
    const previous = previousLanes.current;
    previousLanes.current = { order: laneOrder, zoom, offsets };
    const animations = rowAnimations.current;
    if (lockedOrder !== null || !trackVisible) {
      animations.forEach(animation => animation.cancel());
      animations.clear();
      return;
    }
    if (!previous || previous.order === laneOrder || previous.zoom !== zoom ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    for (const row of rows) {
      const id = row.dataset.rallyLane!;
      const oldTop = previous.offsets.get(id);
      if (oldTop === undefined) continue;
      const inFlight = animations.get(id);
      const remainingOffset = inFlight ? row.getBoundingClientRect().top - (row.parentElement!.getBoundingClientRect().top + row.parentElement!.clientTop + row.offsetTop) : 0;
      inFlight?.cancel();
      const distance = oldTop - row.offsetTop + remainingOffset;
      if (Math.abs(distance) < 1) continue;
      const animation = row.animate(
        [{ transform: `translateY(${distance}px)`, zIndex: 2 }, { transform: 'translateY(0)', zIndex: 2 }],
        { duration: 720, easing: 'cubic-bezier(.22,.72,.25,1)' },
      );
      animations.set(id, animation);
      animation.onfinish = () => { if (animations.get(id) === animation) animations.delete(id); };
    }
  }, [laneOrder, lockedOrder, trackVisible, zoom]);

  const frame = frames[frameIndex];
  const leader = scores[0];
  const focus = scores.at(-1);
  const selectedScore = scores.find(item => item.id === selectedScoreId && item.metrics);
  const scopeLabel = scope === 'regions' ? 'Regional comparison' : scope === 'company' ? 'Whole company' : scope === 'custom' ? 'Selected stores' : scope === 'store' ? 'My store' : validGroups.find(group => group.id === groupId)?.name ?? 'Region';

  return <section className="panel kpi-rally">
    <header className="kpi-rally-header"><div><p className="eyebrow">Performance Rally</p><h2>See movement. Focus the work. Raise the field.</h2><p>A fair, goal-oriented race using PCYA, labor, SPLH, food variance, load, and ADT. Raw sales dollars never affect position.</p></div><Trophy size={42}/></header>
    <div className="kpi-rally-controls">
      {leadership && <label>View<select value={scope} onChange={event => setScope(event.target.value as Scope)}><option value="region">One region</option><option value="regions">Compare regions</option><option value="company">Whole company</option><option value="custom">Choose stores</option></select></label>}
      {leadership && scope === 'region' && <label>Region<select value={groupId} onChange={event => setGroupId(event.target.value)}>{validGroups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>}
      <label>Playback<select value={cadence} onChange={event => setCadence(event.target.value as Cadence)}>{Object.entries(cadenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="kpi-rally-lock">
        <input type="checkbox" checked={lockedOrder !== null} onChange={event => {
          setLockedOrder(event.target.checked ? [...new Set([...scores.map(score => score.id), ...roster])] : null);
        }}/>
        {scope === 'regions' ? 'Lock region positions' : 'Lock store positions'}
      </label>
      {cadence === 'custom' && <><label>From<input type="date" value={customStart} min={allWeeks[0]} max={customEnd || allWeeks.at(-1)} onChange={event => setCustomStart(event.target.value)}/></label><label>Through<input type="date" value={customEnd} min={customStart || allWeeks[0]} max={allWeeks.at(-1)} onChange={event => setCustomEnd(event.target.value)}/></label></>}
    </div>
    {leadership && scope === 'custom' && <details className="kpi-rally-store-picker" open><summary><Users size={17}/> Choose stores across any region</summary><div>{accessibleStores.map(store => <label key={store.id}><input type="checkbox" checked={selectedIds.includes(store.id)} onChange={event => setSelectedIds(current => event.target.checked ? [...new Set([...current, store.id])] : current.filter(id => id !== store.id))}/>{storeLabel(store)}</label>)}</div></details>}
    {!frame || !trackVisible ? <div className="empty-card"><h3>Not enough comparable KPI history yet</h3><p>A store enters the rally automatically after at least four of the six performance measures are available.</p></div> : <>
      <div className="kpi-rally-summary"><div><span>Viewing</span><strong>{scopeLabel}</strong></div><div><span>Results window</span><strong>{frame.start === frame.end ? shortDate(frame.end) : `${shortDate(frame.start)}–${shortDate(frame.end)}`}</strong></div><div><span>Business period</span><strong>{periodLabel(frame.end)}</strong></div><div><span>Priority focus</span><strong>{focus?.name}</strong></div></div>
      <div className="kpi-rally-playback"><button className="button secondary" onClick={() => { setPlaying(false); setFrameIndex(0); }} title="Return to the first available result"><RotateCcw size={16}/></button><button className="button primary" onClick={() => setPlaying(value => !value)}>{playing ? <Pause size={17}/> : <Play size={17}/>} {playing ? 'Pause' : 'Play history'}</button><input aria-label="Performance rally history" type="range" min="0" max={Math.max(0, frames.length - 1)} value={frameIndex} onChange={event => { setPlaying(false); setFrameIndex(Number(event.target.value)); }}/><b>{frameIndex + 1} / {frames.length}</b><label className="kpi-rally-zoom">View size<input aria-label="Rally view size" type="range" min="65" max="100" step="5" value={zoom} onChange={event => setZoom(Number(event.target.value))}/><span>{zoom}%</span></label></div>
      <div ref={trackRef} className={`kpi-rally-track${lockedOrder ? ' locked' : ''}`} aria-label={`${scopeLabel} performance standings`} style={{'--rally-zoom':zoom/100} as CSSProperties}>
        {[75, 50, 25].map(mark => <span key={mark} className="kpi-rally-gridline" style={{left:`${mark}%`}}>{mark}</span>)}
        {lanes.map(id => {
          const entry = rankedScores.get(id);
          if (!entry) return <div className="kpi-rally-lane kpi-rally-empty-lane" key={id} aria-hidden="true"/>;
          const { score: item, rank } = entry;
          return <button type="button" key={id} data-rally-lane={id}
            className={`kpi-rally-lane ${id === focus?.id ? 'focus' : ''} ${id === selectedScoreId ? 'selected' : ''}`}
            onClick={() => item.metrics && setSelectedScoreId(current => current === id ? '' : id)}
            aria-expanded={id === selectedScoreId}>
            <div className="kpi-rally-rank" aria-label={`Rank ${rank}`}>{rank}</div>
            <div className="kpi-rally-name">
              <strong>{item.name}</strong>
              <small>{item.change > .5 ? `▲ ${item.change.toFixed(1)} improving` : item.change < -.5 ? `▼ ${Math.abs(item.change).toFixed(1)} slipping` : '● holding steady'}</small>
            </div>
            <div className="kpi-rally-course">
              <div className="kpi-rally-progress" style={{ width: `${Math.max(4, item.score)}%`, background: item.color }}/>
              <span className="kpi-rally-marker" style={{ left: `clamp(8px, ${item.score}%, calc(100% - 30px))`, borderColor: item.color }}>{id === leader?.id ? '★' : rank}</span>
            </div>
            <div className="kpi-rally-score"><strong>{item.score.toFixed(0)}</strong><small>Opportunity: {item.opportunity}</small><span>{item.metrics ? 'Click for score details' : ''}</span></div>
          </button>;
        })}
      </div>
      {selectedScore && <section className="kpi-rally-breakdown"><header><div><p className="eyebrow">Why this score</p><h3>{selectedScore.name} · {selectedScore.score.toFixed(0)} points</h3><p>Each available KPI contributes equally. Points show the store’s position against all reporting company stores in this same results window.</p></div><button type="button" className="icon-button" aria-label="Close score details" onClick={() => setSelectedScoreId('')}>×</button></header><div>{scoreMetrics.map(key => {const detail=selectedScore.metrics?.[key];const metric=rankingMetrics.find(item=>item.key===key)!;return <article key={key} className={detail&&detail.points<35?'needs-attention':detail&&detail.points>=70?'strong':''}><span>{metric.label}</span><strong>{detail?kpiDisplay(detail.value,key):'No data'}</strong><div><b>{detail?`${detail.points.toFixed(0)} pts`:'—'}</b><small>{detail?`Rank ${detail.rank} of ${detail.eligible}`:'Not scored'}</small></div><progress max="100" value={detail?.points??0}/>{detail&&<p>{detail.points<35?'Primary opportunity':detail.points>=70?'Current strength':'Middle of the company field'}</p>}</article>})}</div><footer><strong>Overall score = average of the available KPI points.</strong><span>Missing information is omitted and never counted as zero. Raw sales dollars are not scored.</span></footer></section>}
      <footer className="kpi-rally-focus"><div><span>Recommended field focus</span><strong>{focus?.name}</strong><p>{focus?.opportunity} is the largest relative opportunity in this results window. Use this as the starting point—not as a judgment of the team.</p></div>{leadership && onOpenPlans && <button className="button secondary" type="button" onClick={onOpenPlans}>Open action planning <ChevronRight size={17}/></button>}</footer>
      {leadership && cadence === 'biweek' && <div className="kpi-rally-meeting"><CalendarDays size={20}/><div><strong>Normal Area Supervisor review cadence</strong><p>Every other Monday, anchored to Nov 30, 2026. Meeting-date overrides will flow with the regional plan rather than changing KPI results.</p></div></div>}
    </>}
  </section>;
}
