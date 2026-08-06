import React, { useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  ClipboardCheck,
  Droplets,
  Gauge,
  Home,
  Menu,
  Plus,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
  X,
} from "lucide-react";

type Tank = {
  id: string;
  name: string;
  product: string;
  level: number;
  litres: string;
  color: string;
};

const tanks: Tank[] = [
  { id: "pms", name: "Tank 02", product: "PMS", level: 82, litres: "24,680 L", color: "#1C7C54" },
  { id: "ago", name: "Tank 04", product: "AGO", level: 61, litres: "18,300 L", color: "#28698B" },
  { id: "dpk", name: "Tank 01", product: "DPK", level: 38, litres: "11,420 L", color: "#B27A28" },
];

const queue = [
  { id: "dip", icon: Droplets, title: "Tank dip awaiting review", detail: "Submitted by Adaeze · 08:42", tone: "amber", action: "Review" },
  { id: "truck", icon: Truck, title: "AGO delivery arriving", detail: "Bay 2 · Driver checked in", tone: "blue", action: "Track" },
  { id: "maintenance", icon: Wrench, title: "Nozzle 03 service window", detail: "Due today · Medium priority", tone: "rose", action: "Open" },
];

export default function PetrotrackCommandCenter() {
  const [activeView, setActiveView] = useState<"pulse" | "stock" | "activity">("pulse");
  const [selectedTank, setSelectedTank] = useState("pms");
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [showAllQueue, setShowAllQueue] = useState(false);
  const [completed, setCompleted] = useState<string[]>([]);
  const [notice, setNotice] = useState("Live sync is on");

  const activeTank = useMemo(
    () => tanks.find((tank) => tank.id === selectedTank) ?? tanks[0],
    [selectedTank],
  );

  function completeItem(id: string) {
    setCompleted((items) => (items.includes(id) ? items : [...items, id]));
    setNotice(id === "dip" ? "Dip review marked as seen" : "Queue item acknowledged");
  }

  return (
    <main className="petro-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; }
        .petro-shell { --ink:#17332B; --muted:#6E8279; --paper:#F3F6F1; --card:#FBFCF8; --line:#DEE8DF; --green:#176A45; --green-soft:#E1F0E6; --navy:#173E55; --amber:#A56E1E; --amber-soft:#FFF0D6; width:100%; min-height:100%; background:var(--paper); color:var(--ink); font-family:'DM Sans', sans-serif; overflow:hidden; position:relative; }
        .petro-shell:before { content:""; pointer-events:none; position:absolute; inset:0; opacity:.18; background-image:radial-gradient(#8EA79A .65px, transparent .65px); background-size:9px 9px; mask-image:linear-gradient(to bottom,rgba(0,0,0,.4),transparent 78%); }
        .petro-top { position:relative; padding:24px 22px 18px; background:#173E32; color:#F8FFF8; border-bottom-left-radius:28px; border-bottom-right-radius:28px; overflow:hidden; }
        .petro-top:after { content:""; position:absolute; width:240px; height:240px; border:1px solid rgba(206,240,214,.14); border-radius:50%; right:-94px; top:-150px; box-shadow:0 0 0 28px rgba(206,240,214,.035),0 0 0 56px rgba(206,240,214,.025); }
        .top-row,.row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .eyebrow { text-transform:uppercase; letter-spacing:.16em; font-size:9px; font-weight:700; color:#B7D7BF; }
        .site-name { font-size:21px; font-weight:700; letter-spacing:-.04em; margin-top:5px; }
        .site-sub { font-size:11px; color:#B9CEC0; margin-top:3px; }
        .icon-button { width:36px; height:36px; border:1px solid rgba(255,255,255,.18); border-radius:12px; background:rgba(255,255,255,.08); color:#F8FFF8; display:grid; place-items:center; cursor:pointer; }
        .status-strip { display:flex; align-items:center; gap:7px; margin-top:20px; font-size:11px; color:#D3E9D5; }
        .status-dot { width:7px; height:7px; border-radius:99px; background:#74DB95; box-shadow:0 0 0 4px rgba(116,219,149,.12); }
        .top-date { margin-left:auto; font-family:'Space Mono',monospace; font-size:9px; color:#97BBA4; }
        .page { position:relative; padding:18px 18px 88px; }
        .view-switcher { display:flex; gap:4px; background:#E5ECE5; border:1px solid #D8E2D8; padding:4px; border-radius:14px; }
        .view-switcher button { flex:1; padding:9px 4px; border:0; border-radius:10px; color:#71847A; background:transparent; font:600 11px 'DM Sans',sans-serif; cursor:pointer; }
        .view-switcher button.active { background:#FBFCF8; color:var(--green); box-shadow:0 2px 6px rgba(30,67,47,.09); }
        .greeting { margin:20px 2px 15px; }
        .greeting h1 { margin:0; font-size:25px; letter-spacing:-.055em; line-height:1.05; }
        .greeting p { margin:7px 0 0; color:var(--muted); font-size:12px; line-height:1.45; }
        .pulse-card { background:#FBFCF8; border:1px solid var(--line); border-radius:20px; padding:16px; box-shadow:0 8px 26px rgba(36,72,48,.055); }
        .section-label { color:var(--muted); text-transform:uppercase; letter-spacing:.13em; font-size:9px; font-weight:700; }
        .pulse-main { margin-top:12px; display:flex; align-items:center; gap:15px; }
        .pulse-ring { width:78px; height:78px; border-radius:50%; display:grid; place-items:center; flex:none; background:conic-gradient(#3D9B68 0 72%,#E5EEE5 72% 100%); position:relative; }
        .pulse-ring:after { content:""; position:absolute; inset:8px; background:#FBFCF8; border-radius:50%; }
        .pulse-number { position:relative; z-index:1; font-size:23px; font-weight:700; letter-spacing:-.06em; }
        .pulse-copy { min-width:0; }
        .pulse-copy h2 { margin:0 0 4px; font-size:16px; letter-spacing:-.025em; }
        .pulse-copy p { margin:0; color:var(--muted); font-size:11px; line-height:1.4; }
        .pulse-copy strong { color:var(--green); }
        .mini-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; border-top:1px solid var(--line); margin-top:15px; padding-top:13px; }
        .mini-stat { padding-left:9px; border-left:2px solid #DDEADE; }
        .mini-stat:first-child { padding-left:0; border-left:0; }
        .mini-stat b { display:block; font-family:'Space Mono',monospace; font-size:12px; }
        .mini-stat span { display:block; margin-top:3px; font-size:9px; color:var(--muted); }
        .block-head { margin:24px 2px 10px; display:flex; align-items:center; justify-content:space-between; }
        .block-head button { border:0; padding:0; background:none; color:var(--green); font:700 11px 'DM Sans',sans-serif; cursor:pointer; }
        .stock-rail { display:flex; gap:9px; overflow-x:auto; padding:1px 1px 5px; scrollbar-width:none; }
        .stock-rail::-webkit-scrollbar { display:none; }
        .tank-card { min-width:136px; padding:13px; border-radius:16px; border:1px solid var(--line); background:rgba(251,252,248,.78); cursor:pointer; text-align:left; transition:transform .18s ease, border-color .18s ease, background .18s ease; }
        .tank-card:hover { transform:translateY(-2px); }
        .tank-card.selected { background:#E5F1E8; border-color:#86BD99; }
        .tank-top { display:flex; justify-content:space-between; align-items:center; }
        .tank-icon { width:26px; height:26px; border-radius:9px; display:grid; place-items:center; }
        .tank-product { font:700 10px 'Space Mono',monospace; color:var(--muted); }
        .tank-name { font-size:11px; font-weight:600; margin-top:13px; }
        .tank-level { font:700 17px 'Space Mono',monospace; margin-top:4px; letter-spacing:-.07em; }
        .tank-level span { font:400 9px 'DM Sans',sans-serif; color:var(--muted); letter-spacing:0; }
        .tank-bar { height:5px; border-radius:99px; background:#DCE8DE; overflow:hidden; margin-top:11px; }
        .tank-bar i { display:block; height:100%; border-radius:99px; }
        .focus-strip { display:flex; gap:9px; align-items:center; margin-top:11px; padding:10px 11px; border-radius:13px; background:#E8F1F2; color:#285F70; font-size:10px; }
        .focus-strip span { flex:1; line-height:1.35; }
        .queue-list { display:grid; gap:8px; }
        .queue-item { display:flex; align-items:center; gap:10px; padding:12px 11px; background:rgba(251,252,248,.82); border:1px solid var(--line); border-radius:15px; }
        .queue-item.done { opacity:.52; }
        .queue-icon { width:32px; height:32px; border-radius:10px; display:grid; place-items:center; flex:none; }
        .queue-copy { flex:1; min-width:0; }
        .queue-copy b { display:block; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .queue-copy span { display:block; color:var(--muted); font-size:10px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .queue-action { border:1px solid #CADBCE; background:#F8FBF7; color:var(--green); border-radius:9px; padding:7px 8px; font:700 10px 'DM Sans',sans-serif; cursor:pointer; }
        .queue-action.check { width:28px; height:28px; padding:0; border-radius:50%; display:grid; place-items:center; }
        .activity-card { display:grid; gap:0; padding:2px 0; }
        .activity-row { display:flex; gap:12px; padding:14px 2px; border-bottom:1px solid var(--line); }
        .activity-row:last-child { border-bottom:0; }
        .activity-time { width:38px; color:var(--muted); font:9px 'Space Mono',monospace; padding-top:2px; }
        .activity-line { position:relative; width:10px; border-left:1px solid #B7D5BF; }
        .activity-line i { position:absolute; top:3px; left:-4px; width:7px; height:7px; border-radius:50%; background:#368D60; border:2px solid #FBFCF8; }
        .activity-copy b { font-size:11px; display:block; }
        .activity-copy span { display:block; color:var(--muted); font-size:10px; margin-top:3px; }
        .bottom-nav { position:absolute; z-index:2; bottom:0; left:0; right:0; height:72px; background:rgba(251,252,248,.94); border-top:1px solid var(--line); display:flex; align-items:center; justify-content:space-around; backdrop-filter:blur(12px); }
        .nav-item { display:grid; justify-items:center; gap:4px; color:#8A9C92; font:600 9px 'DM Sans',sans-serif; border:0; background:none; cursor:pointer; }
        .nav-item.active { color:var(--green); }
        .nav-center { width:48px; height:48px; border-radius:17px; border:4px solid var(--paper); margin-top:-25px; background:#176A45; color:#fff; display:grid; place-items:center; box-shadow:0 7px 18px rgba(23,106,69,.25); cursor:pointer; }
        .sheet-scrim { position:absolute; inset:0; z-index:4; background:rgba(13,38,28,.36); display:flex; align-items:flex-end; }
        .log-sheet { width:100%; background:#FBFCF8; border-radius:25px 25px 0 0; padding:20px 18px 24px; box-shadow:0 -12px 30px rgba(19,55,35,.18); animation:up .22s ease-out; }
        @keyframes up { from { transform:translateY(24px); opacity:.5 } to { transform:translateY(0); opacity:1 } }
        .sheet-handle { width:38px; height:4px; border-radius:9px; background:#D4E0D6; margin:0 auto 18px; }
        .sheet-title { font-size:18px; letter-spacing:-.04em; margin:0; }
        .sheet-sub { color:var(--muted); font-size:11px; margin:4px 0 17px; }
        .sheet-option { display:flex; align-items:center; gap:12px; width:100%; padding:12px; border-radius:14px; border:1px solid var(--line); background:#F5F8F3; margin-top:8px; cursor:pointer; text-align:left; }
        .sheet-option strong { font-size:12px; display:block; }
        .sheet-option small { color:var(--muted); font-size:10px; display:block; margin-top:2px; }
        .toast { position:absolute; z-index:3; left:18px; right:18px; top:159px; border:1px solid #B7D9C1; background:#ECF8EF; color:#296440; border-radius:11px; padding:9px 11px; font-size:10px; display:flex; gap:7px; align-items:center; animation:fade .2s ease-out; }
        @keyframes fade { from { opacity:0; transform:translateY(-5px) } to { opacity:1; transform:translateY(0) } }
        @media (min-width:600px) { .petro-shell { max-width:450px; margin:auto; } }
      `}</style>

      <header className="petro-top">
        <div className="top-row">
          <div>
            <div className="eyebrow">Petrotrack / Control room</div>
            <div className="site-name">Lekki Phase 1</div>
            <div className="site-sub">Station 04 · Operating shift</div>
          </div>
          <button className="icon-button" onClick={() => setNotice("No new alerts")} aria-label="View alerts"><Bell size={17} /></button>
        </div>
        <div className="status-strip">
          <i className="status-dot" />
          <span>{notice}</span>
          <span className="top-date">14 JUN · 09:18</span>
        </div>
      </header>

      <div className="page">
        <div className="view-switcher" role="tablist" aria-label="Dashboard views">
          {([["pulse", "Pulse"], ["stock", "Stock"], ["activity", "Activity"]] as const).map(([key, label]) => (
            <button key={key} className={activeView === key ? "active" : ""} onClick={() => setActiveView(key)} role="tab" aria-selected={activeView === key}>{label}</button>
          ))}
        </div>

        {activeView === "pulse" && (
          <>
            <section className="greeting">
              <div className="eyebrow" style={{ color: "#789184" }}>Wednesday · 14 June 2024</div>
              <h1>Good morning, Chinedu.</h1>
              <p>Here is the work that needs your attention before the next handover.</p>
            </section>

            <section className="pulse-card">
              <div className="section-label">Station health</div>
              <div className="pulse-main">
                <div className="pulse-ring"><div className="pulse-number">72<span style={{ fontSize: 11, color: "#6E8279" }}>%</span></div></div>
                <div className="pulse-copy">
                  <h2>Running steady</h2>
                  <p>Sales are <strong>8.4% ahead</strong> of yesterday. One issue needs a decision.</p>
                </div>
              </div>
              <div className="mini-stats">
                <div className="mini-stat"><b>₦2.84m</b><span>Shift sales</span></div>
                <div className="mini-stat"><b>18.3k L</b><span>Dispensed</span></div>
                <div className="mini-stat"><b>03</b><span>Open tasks</span></div>
              </div>
            </section>

            <div className="block-head"><div className="section-label">Stock watch</div><button onClick={() => setActiveView("stock")}>Open inventory <ArrowRight size={12} style={{ verticalAlign: "middle" }} /></button></div>
            <div className="stock-rail">
              {tanks.map((tank) => (
                <button key={tank.id} className={`tank-card ${selectedTank === tank.id ? "selected" : ""}`} onClick={() => setSelectedTank(tank.id)}>
                  <div className="tank-top"><div className="tank-icon" style={{ background: `${tank.color}18`, color: tank.color }}><Droplets size={14} /></div><span className="tank-product">{tank.product}</span></div>
                  <div className="tank-name">{tank.name}</div>
                  <div className="tank-level">{tank.level}<span>% full</span></div>
                  <div className="tank-bar"><i style={{ width: `${tank.level}%`, background: tank.color }} /></div>
                </button>
              ))}
            </div>
            <div className="focus-strip"><Gauge size={15} /><span><b>{activeTank.product} focus:</b> {activeTank.litres} available · next delivery in 2h 40m</span><ChevronDown size={14} /></div>

            <div className="block-head"><div className="section-label">Action queue</div><button onClick={() => setShowAllQueue((value) => !value)}>{showAllQueue ? "Show less" : "View all"}</button></div>
            <div className="queue-list">
              {queue.slice(0, showAllQueue ? queue.length : 2).map((item) => {
                const Icon = item.icon;
                const done = completed.includes(item.id);
                const tone = item.tone === "amber" ? { bg: "#FFF0D6", fg: "#A56E1E" } : item.tone === "blue" ? { bg: "#E3F0F5", fg: "#28698B" } : { bg: "#F7E6E4", fg: "#9A5149" };
                return <div className={`queue-item ${done ? "done" : ""}`} key={item.id}>
                  <div className="queue-icon" style={{ background: tone.bg, color: tone.fg }}>{done ? <Check size={16} /> : <Icon size={16} />}</div>
                  <div className="queue-copy"><b>{item.title}</b><span>{item.detail}</span></div>
                  <button className={done ? "queue-action check" : "queue-action"} onClick={() => completeItem(item.id)} aria-label={done ? "Completed" : item.action}>{done ? <Check size={14} /> : item.action}</button>
                </div>;
              })}
            </div>
          </>
        )}

        {activeView === "stock" && (
          <>
            <section className="greeting"><div className="eyebrow" style={{ color: "#789184" }}>Inventory / live readings</div><h1>Every litre accounted for.</h1><p>Tap a tank to inspect its last dip, capacity and delivery forecast.</p></section>
            <section className="pulse-card">
              <div className="section-label">Selected tank</div>
              <div style={{ display: "flex", alignItems: "center", gap: 13, marginTop: 12 }}><div className="tank-icon" style={{ width: 42, height: 42, background: `${activeTank.color}18`, color: activeTank.color }}><Droplets size={20} /></div><div><div style={{ fontSize: 16, fontWeight: 700 }}>{activeTank.name} · {activeTank.product}</div><div style={{ color: "var(--muted)", fontSize: 11, marginTop: 3 }}>Last dip today at 08:42 · by Adaeze</div></div></div>
              <div style={{ marginTop: 18, display: "flex", alignItems: "end", justifyContent: "space-between" }}><strong style={{ font: "700 31px 'Space Mono', monospace", letterSpacing: "-.08em" }}>{activeTank.litres}</strong><span style={{ color: activeTank.color, fontWeight: 700, fontSize: 13 }}>{activeTank.level}% full</span></div>
              <div className="tank-bar" style={{ height: 9, marginTop: 10 }}><i style={{ width: `${activeTank.level}%`, background: activeTank.color }} /></div>
              <div className="mini-stats"><div className="mini-stat"><b>30,000 L</b><span>Capacity</span></div><div className="mini-stat"><b>5,320 L</b><span>Headroom</span></div><div className="mini-stat"><b>2h 40m</b><span>Next delivery</span></div></div>
            </section>
            <div className="block-head"><div className="section-label">All tanks</div><span style={{ color: "var(--muted)", fontSize: 10 }}>3 active assets</span></div>
            <div className="stock-rail" style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>{tanks.map((tank) => <button key={tank.id} className={`tank-card ${selectedTank === tank.id ? "selected" : ""}`} style={{ minWidth: 0 }} onClick={() => setSelectedTank(tank.id)}><div className="tank-top"><div className="tank-icon" style={{ background: `${tank.color}18`, color: tank.color }}><Droplets size={14} /></div><span className="tank-product">{tank.product}</span></div><div className="tank-name">{tank.name}</div><div className="tank-level">{tank.level}<span>% full</span></div><div className="tank-bar"><i style={{ width: `${tank.level}%`, background: tank.color }} /></div></button>)}</div>
            <div className="queue-item" style={{ marginTop: 12 }}><div className="queue-icon" style={{ background: "#E3F0F5", color: "#28698B" }}><ClipboardCheck size={16} /></div><div className="queue-copy"><b>Next audit window</b><span>Tomorrow · 06:00–08:00 · All tanks</span></div><button className="queue-action" onClick={() => setNotice("Audit window added to your shift")}>Add</button></div>
          </>
        )}

        {activeView === "activity" && (
          <>
            <section className="greeting"><div className="eyebrow" style={{ color: "#789184" }}>Shift log / today</div><h1>The station, in sequence.</h1><p>A clean handover trail for every reading, sale and decision.</p></section>
            <section className="pulse-card activity-card">{[["09:18", "Station sync completed", "All 12 devices reporting · just now"], ["08:42", "Tank dip submitted", "Adaeze recorded readings for 3 tanks"], ["08:07", "Shift opened", "Chinedu · Morning shift"], ["07:55", "AGO delivery checked in", "Bay 2 · Ref TRK-4821"]].map(([time, title, detail]) => <div className="activity-row" key={time + title}><div className="activity-time">{time}</div><div className="activity-line"><i /></div><div className="activity-copy"><b>{title}</b><span>{detail}</span></div></div>)}</section>
            <div className="block-head"><div className="section-label">Handover note</div><button onClick={() => setNotice("Handover note marked ready")}>Mark ready <Check size={12} style={{ verticalAlign: "middle" }} /></button></div>
            <div className="focus-strip" style={{ background: "#F5EEE1", color: "#765321" }}><ShieldCheck size={15} /><span>All critical readings are captured. Add a note before handing the station over.</span><ArrowRight size={14} /></div>
          </>
        )}
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className="nav-item active" onClick={() => setActiveView("pulse")}><Home size={18} /><span>Overview</span></button>
        <button className="nav-item" onClick={() => setActiveView("activity")}><Activity size={18} /><span>Log</span></button>
        <button className="nav-center" onClick={() => setShowLogSheet(true)} aria-label="Log a reading"><Plus size={22} /></button>
        <button className="nav-item" onClick={() => setNotice("No new alerts")}><Bell size={18} /><span>Alerts</span></button>
        <button className="nav-item" onClick={() => setNotice("Settings opened")}><Menu size={18} /><span>More</span></button>
      </nav>

      {showLogSheet && <div className="sheet-scrim" onClick={() => setShowLogSheet(false)}>
        <section className="log-sheet" onClick={(event) => event.stopPropagation()}>
          <div className="sheet-handle" />
          <div className="row"><div><h2 className="sheet-title">Log to the station</h2><p className="sheet-sub">Choose a quick action. Your shift log updates instantly.</p></div><button className="icon-button" style={{ background: "#EEF4EE", color: "var(--ink)", borderColor: "var(--line)" }} onClick={() => setShowLogSheet(false)} aria-label="Close"><X size={17} /></button></div>
          <button className="sheet-option" onClick={() => { setShowLogSheet(false); setNotice("New tank dip started"); }}><div className="queue-icon" style={{ background: "#E1F0E6", color: "var(--green)" }}><ScanLine size={17} /></div><div><strong>Record tank dip</strong><small>Capture readings across all active tanks</small></div><ArrowRight size={15} color="#80948A" /></button>
          <button className="sheet-option" onClick={() => { setShowLogSheet(false); setNotice("Maintenance request started"); }}><div className="queue-icon" style={{ background: "#F7E6E4", color: "#9A5149" }}><Wrench size={17} /></div><div><strong>Report maintenance</strong><small>Flag a pump, nozzle or site issue</small></div><ArrowRight size={15} color="#80948A" /></button>
          <button className="sheet-option" onClick={() => { setShowLogSheet(false); setNotice("Handover note started"); }}><div className="queue-icon" style={{ background: "#E3F0F5", color: "#28698B" }}><Sparkles size={17} /></div><div><strong>Add handover note</strong><small>Leave context for the next shift</small></div><ArrowRight size={15} color="#80948A" /></button>
        </section>
      </div>}
    </main>
  );
}