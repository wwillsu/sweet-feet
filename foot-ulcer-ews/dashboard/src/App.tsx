import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { LiveView } from "./components/LiveView";
import { TrackerView } from "./components/TrackerView";
import { HAS_CONVEX, LIVE_DEMO, profileLabel, SAVED, useConvexQuery } from "./lib";

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return `${Math.round(s / 3600)} h ago`;
}

function useStored(key: string, initial: string | null) {
  const [v, setV] = useState<string | null>(() => localStorage.getItem(key) ?? initial);
  const set = (next: string | null) => {
    if (next) localStorage.setItem(key, next);
    else localStorage.removeItem(key);
    setV(next);
  };
  return [v, set] as const;
}

function ThemeToggle() {
  const [theme, setTheme] = useStored("theme", null);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);
  const next = theme === null ? "light" : theme === "light" ? "dark" : null;
  return (
    <button className="ghost" onClick={() => setTheme(next)} title="Theme: system → light → dark">
      Theme: {theme ?? "system"}
    </button>
  );
}

type Mode = "daily" | "live";

type Profile = { patientId: string; updatedAt: number | null };

export default function App() {
  const remote = useConvexQuery(api.dashboard.overview);
  const live = useConvexQuery(api.dashboard.live, { seconds: LIVE_DEMO.history_s });
  const [profile, setProfile] = useStored("profile", null);
  const [mode, setMode] = useStored("mode", "daily");
  const now = useNow(1000);

  // Bundled profiles are always there; Convex adds new ones and marks pushed ones as live.
  const byId = new Map<string, Profile>(SAVED.patients.map((p) => [p.patientId, { patientId: p.patientId, updatedAt: null }]));
  for (const p of remote ?? []) byId.set(p.patientId, { patientId: p.patientId, updatedAt: p.updatedAt });
  const list = [...byId.values()].sort((a, b) => a.patientId.localeCompare(b.patientId));
  const current = list.find((p) => p.patientId === profile)?.patientId
    ?? list.find((p) => p.patientId === "me")?.patientId
    ?? list[0]?.patientId ?? null;
  const lastLive = live?.length ? live[live.length - 1].t : 0;
  const streaming = lastLive > 0 && now - lastLive < 3000;
  const updatedAt = mode === "live" ? lastLive : list.find((p) => p.patientId === current)?.updatedAt ?? 0;
  const fresh = updatedAt && now - updatedAt < (mode === "live" ? 3000 : 15000);
  const status = updatedAt ? `Updated ${ago(now - updatedAt)}` : mode === "live" ? "Waiting for data" : "Saved data";

  const picker = list.length > 1 && (
    <label className="profile-pick">
      <span className="muted">Profiles</span>
      <select value={current ?? ""} onChange={(e) => setProfile(e.target.value)}>
        {list.map((p) => (
          <option key={p.patientId} value={p.patientId}>{profileLabel(p.patientId)}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="app">
      <header className="topbar">
        <div />{/* keeps the tabs centred */}
        <div className="tabs" role="tablist" aria-label="View">
          {(["daily", "live"] as Mode[]).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} className={`tab ${mode === m ? "active" : ""}`} onClick={() => setMode(m)}>
              {m === "daily" ? "Daily tracker" : "Live demo"}
              {m === "live" && streaming && <span className="live-dot on" aria-label="streaming" />}
            </button>
          ))}
        </div>
        <div className="topbar-right">
          <span className={`live ${fresh ? "on" : ""}`}>
            <span className="live-dot" />
            {status}
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="main">
        {mode === "live" ? (
          !HAS_CONVEX ? (
            <div className="empty">
              <h2>The live demo needs Convex</h2>
              <p>Run <code>npm run dev</code> in the project root. It starts the local backend and writes <code>VITE_CONVEX_URL</code> to <code>.env.local</code>.</p>
            </div>
          ) : live === undefined ? (
            <div className="empty">Connecting to Convex… (start it with <code>npm run dev</code>)</div>
          ) : (
            <LiveView samples={live} streaming={streaming} />
          )
        ) : !current ? (
          <div className="empty">
            <h2>No readings yet</h2>
            <p>Rebuild the bundled data, or push pipeline results to Convex, from the project root:</p>
            <pre>python -m pipeline.export_static        # data/dashboard.json{"\n"}python -m pipeline.push_convex          # everything at once</pre>
          </div>
        ) : (
          <TrackerView key={current} patientId={current} picker={picker} />
        )}
      </main>
    </div>
  );
}
