import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Droplets,
  Download,
  FileText,
  Fuel,
  LayoutGrid,
  MoreHorizontal,
  PackageCheck,
  Search,
  Truck,
  Wrench,
  X,
  ArrowLeft,
} from "lucide-react";

type WorkTab = "dispatch" | "stock" | "tasks" | "reports";
type Filter = "all" | "action" | "moving";

type Tank = {
  id: string;
  name: string;
  product: string;
  litres: string;
  level: number;
  capacity: string;
  tone: string;
  delivery: string;
};

type WorkItem = {
  id: string;
  kind: "delivery" | "dip" | "maintenance";
  title: string;
  detail: string;
  meta: string;
  state: "action" | "moving" | "done";
};

type Report = {
  id: string;
  title: string;
  period: string;
  status: "Ready" | "Needs review";
  summary: string;
  accent: string;
  metrics: Array<[string, string]>;
  sections: Array<[string, string]>;
};

const tanks: Tank[] = [
  { id: "pms", name: "Tank 02", product: "PMS", litres: "24,680 L", level: 82, capacity: "30,000 L", tone: "#237653", delivery: "Tomorrow · 07:30" },
  { id: "ago", name: "Tank 04", product: "AGO", litres: "18,300 L", level: 61, capacity: "30,000 L", tone: "#2C6B83", delivery: "Today · 11:40" },
  { id: "dpk", name: "Tank 01", product: "DPK", litres: "11,420 L", level: 38, capacity: "30,000 L", tone: "#A56E1E", delivery: "Tomorrow · 14:00" },
  { id: "lpg", name: "Cage A", product: "LPG", litres: "1,840 kg", level: 46, capacity: "4,000 kg", tone: "#8D5D85", delivery: "Fri · 08:00" },
];

const initialWork: WorkItem[] = [
  { id: "delivery", kind: "delivery", title: "AGO delivery arriving", detail: "Bay 2 · TRK-4821 · 18,000 L expected", meta: "in 2h 20m", state: "moving" },
  { id: "dip", kind: "dip", title: "Tank dip awaiting review", detail: "PMS variance +120 L · submitted by Adaeze", meta: "needs decision", state: "action" },
  { id: "maintenance", kind: "maintenance", title: "Nozzle 03 service window", detail: "Pressure test and seal inspection", meta: "due today", state: "action" },
];

const reports: Report[] = [
  {
    id: "shift-14-jun",
    title: "Shift handover report",
    period: "14 Jun · Morning shift",
    status: "Ready",
    summary: "A complete operational snapshot for the operator taking over at Lekki Phase 1.",
    accent: "#176A45",
    metrics: [["Net sales", "₦4.82m"], ["Volume moved", "12,640 L"], ["Checks covered", "3 / 4"]],
    sections: [
      ["Opening readings", "PMS, AGO, DPK and LPG readings captured at 06:00."],
      ["Exceptions", "PMS variance of +120 L is waiting for manager acknowledgement."],
      ["Next shift", "AGO delivery expected at Bay 2 today at 11:40."],
    ],
  },
  {
    id: "stock-variance",
    title: "Stock variance report",
    period: "01–14 Jun · Current cycle",
    status: "Needs review",
    summary: "Compare physical dip readings with expected book stock across every active asset.",
    accent: "#A56E1E",
    metrics: [["Physical stock", "56,240 L"], ["Variance", "+120 L"], ["Assets checked", "4 / 4"]],
    sections: [
      ["PMS · Tank 02", "24,680 L physical · variance +120 L against book stock."],
      ["AGO · Tank 04", "18,300 L physical · within expected tolerance."],
      ["LPG · Cage A", "1,840 kg physical · next receipt scheduled Friday."],
    ],
  },
  {
    id: "delivery-register",
    title: "Delivery register",
    period: "June 2024 · Through 14 Jun",
    status: "Ready",
    summary: "A receiving trail for product deliveries, waybills, and quantities reconciled at the bay.",
    accent: "#2C6B83",
    metrics: [["Deliveries", "8"], ["Volume received", "144,000 L"], ["Reconciled", "100%"]],
    sections: [
      ["Latest delivery", "AGO · 18,000 L expected · TRK-4821 · Bay 2."],
      ["Receipt checks", "Quantity, seal, waybill and product quality checks are complete."],
      ["Upcoming", "Next scheduled delivery is tomorrow at 07:30."],
    ],
  },
];

const iconFor = (kind: WorkItem["kind"]) => {
  if (kind === "delivery") return Truck;
  if (kind === "dip") return Droplets;
  return Wrench;
};

const toneFor = (kind: WorkItem["kind"]) => {
  if (kind === "delivery") return { bg: "#E3EEF0", fg: "#2C6B83" };
  if (kind === "dip") return { bg: "#FFF0D6", fg: "#A56E1E" };
  return { bg: "#F5E8E5", fg: "#9A5149" };
};

export default function PetrotrackInventoryDesk() {
  const [tab, setTab] = useState<WorkTab>("dispatch");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedTankId, setSelectedTankId] = useState("ago");
  const [selectedWorkId, setSelectedWorkId] = useState("dip");
  const [work, setWork] = useState(initialWork);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("Live · synced 14 seconds ago");
  const [showTankSheet, setShowTankSheet] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const selectedTank = useMemo(
    () => tanks.find((tank) => tank.id === selectedTankId) ?? tanks[0],
    [selectedTankId],
  );
  const selectedWork = useMemo(
    () => work.find((item) => item.id === selectedWorkId) ?? work[0],
    [selectedWorkId, work],
  );
  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId) ?? null,
    [selectedReportId],
  );
  const filteredWork = useMemo(() => {
    const matchingFilter = work.filter((item) => {
      if (filter === "action") return item.state === "action";
      if (filter === "moving") return item.state === "moving";
      return true;
    });
    if (!query.trim()) return matchingFilter;
    const term = query.toLowerCase();
    return matchingFilter.filter((item) => `${item.title} ${item.detail}`.toLowerCase().includes(term));
  }, [filter, query, work]);

  function acknowledge(item: WorkItem) {
    setWork((current) => current.map((entry) => entry.id === item.id ? { ...entry, state: "done", meta: "acknowledged" } : entry));
    setNotice(`${item.title} acknowledged · queue updated`);
  }

  function openTab(next: WorkTab) {
    setTab(next);
    if (next !== "reports") setSelectedReportId(null);
    setNotice(next === "stock" ? "Stock readings are current" : next === "tasks" ? "Showing the open work queue" : next === "reports" ? "Reports list is ready" : "Dispatch board is current");
  }

  function openReport(report: Report) {
    setSelectedReportId(report.id);
    setNotice(`${report.title} opened · viewing on screen`);
  }

  function closeReport() {
    setSelectedReportId(null);
    setNotice("Reports list is ready");
  }

  return (
    <main className="desk-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        button, input { font: inherit; }
        .desk-shell { --ink:#18352F; --muted:#72847D; --paper:#F1F5F0; --card:#FCFDF9; --line:#DCE7DE; --green:#176A45; --navy:#173E55; --amber:#A56E1E; width:100%; min-height:100%; overflow:hidden; position:relative; color:var(--ink); background:var(--paper); font-family:'DM Sans',sans-serif; }
        .desk-shell:before { content:""; position:absolute; pointer-events:none; inset:0; opacity:.13; background-image:radial-gradient(#789184 .65px, transparent .65px); background-size:9px 9px; mask-image:linear-gradient(to bottom,rgba(0,0,0,.34),transparent 74%); }
        .masthead { position:relative; padding:20px 19px 18px; color:#F6FFF8; background:#173E32; border-bottom-left-radius:28px; border-bottom-right-radius:28px; }
        .mast-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .eyebrow { color:#A9CEB1; text-transform:uppercase; letter-spacing:.16em; font-size:9px; font-weight:700; }
        .mast-title { margin-top:6px; font-size:22px; font-weight:700; letter-spacing:-.055em; }
        .mast-sub { margin-top:3px; color:#B8D0BE; font-size:10px; }
        .mast-actions { display:flex; gap:7px; }
        .round-action { width:35px; height:35px; display:grid; place-items:center; border:1px solid rgba(255,255,255,.18); border-radius:11px; background:rgba(255,255,255,.08); color:#F6FFF8; cursor:pointer; }
        .sync-row { display:flex; align-items:center; gap:7px; margin-top:19px; color:#D2E7D6; font-size:10px; }
        .live-dot { width:7px; height:7px; border-radius:50%; background:#78DF99; box-shadow:0 0 0 4px rgba(120,223,153,.12); }
        .timestamp { margin-left:auto; color:#9CBCA4; font:9px 'Space Mono',monospace; }
        .desk-body { position:relative; padding:17px 17px 86px; }
        .workspace-tabs { display:flex; gap:4px; padding:4px; border:1px solid #D7E2D8; border-radius:14px; background:#E4EBE4; }
        .workspace-tabs button { flex:1; padding:9px 3px; border:0; border-radius:10px; background:transparent; color:#75877F; font-size:10px; font-weight:700; cursor:pointer; }
        .workspace-tabs button.active { color:var(--green); background:#FCFDF9; box-shadow:0 2px 6px rgba(32,72,49,.09); }
        .runway { margin-top:17px; padding:15px; border:1px solid var(--line); border-radius:19px; background:var(--card); box-shadow:0 8px 25px rgba(36,72,48,.05); }
        .runway-top { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .section-label { color:var(--muted); text-transform:uppercase; letter-spacing:.14em; font-size:9px; font-weight:700; }
        .runway-title { margin-top:6px; font-size:17px; letter-spacing:-.04em; }
        .runway-title em { color:var(--green); font-family:'Instrument Serif',serif; font-size:20px; font-weight:400; }
        .runway-score { color:var(--green); font:700 22px 'Space Mono',monospace; letter-spacing:-.08em; }
        .runway-score span { color:var(--muted); font:400 9px 'DM Sans',sans-serif; letter-spacing:0; }
        .runway-copy { margin:5px 0 0; max-width:270px; color:var(--muted); font-size:10px; line-height:1.4; }
        .runway-bar { height:7px; margin-top:15px; overflow:hidden; border-radius:99px; background:#E3ECE4; }
        .runway-bar i { display:block; width:72%; height:100%; border-radius:99px; background:#329360; }
        .runway-foot { display:flex; justify-content:space-between; margin-top:9px; color:var(--muted); font-size:9px; }
        .runway-foot strong { color:var(--green); }
        .section-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:23px 2px 10px; }
        .section-head button { display:inline-flex; align-items:center; gap:3px; border:0; padding:0; background:none; color:var(--green); font-size:10px; font-weight:700; cursor:pointer; }
        .search-box { display:flex; align-items:center; gap:8px; padding:10px 11px; border:1px solid var(--line); border-radius:12px; background:rgba(252,253,249,.8); color:#8A9B92; }
        .search-box input { width:100%; border:0; outline:0; background:transparent; color:var(--ink); font-size:10px; }
        .filter-row { display:flex; gap:6px; margin-top:8px; overflow:auto; scrollbar-width:none; }
        .filter-row::-webkit-scrollbar { display:none; }
        .filter-pill { padding:7px 10px; white-space:nowrap; border:1px solid var(--line); border-radius:99px; background:rgba(252,253,249,.7); color:var(--muted); font-size:9px; font-weight:700; cursor:pointer; }
        .filter-pill.active { border-color:#91BBA0; background:#E5F1E8; color:var(--green); }
        .work-list { display:grid; gap:7px; margin-top:10px; }
        .work-row { display:flex; align-items:center; gap:9px; width:100%; padding:11px; border:1px solid var(--line); border-radius:15px; background:rgba(252,253,249,.84); text-align:left; cursor:pointer; transition:transform .18s ease,border-color .18s ease,background .18s ease; }
        .work-row:hover { transform:translateY(-1px); border-color:#B5D2BC; }
        .work-row.selected { border-color:#8EB79C; background:#EDF6EE; }
        .work-row.done { opacity:.55; }
        .work-icon { width:31px; height:31px; display:grid; place-items:center; flex:none; border-radius:10px; }
        .work-copy { min-width:0; flex:1; }
        .work-copy b { display:block; overflow:hidden; color:var(--ink); font-size:10px; text-overflow:ellipsis; white-space:nowrap; }
        .work-copy span { display:block; overflow:hidden; margin-top:3px; color:var(--muted); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
        .work-meta { display:flex; align-items:center; gap:4px; margin-top:6px; color:var(--amber); font-size:8px; font-weight:700; }
        .work-row.done .work-meta { color:var(--green); }
        .work-check { width:26px; height:26px; display:grid; place-items:center; flex:none; border:1px solid #C8D9CC; border-radius:50%; background:#F9FCF8; color:var(--green); cursor:pointer; }
        .tank-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
        .tank-tile { position:relative; padding:12px; border:1px solid var(--line); border-radius:15px; background:rgba(252,253,249,.84); text-align:left; cursor:pointer; }
        .tank-tile.selected { border-color:#8EB79C; background:#E8F3E9; }
        .tank-tile-top { display:flex; align-items:center; justify-content:space-between; }
        .tank-product { color:var(--muted); font:700 9px 'Space Mono',monospace; }
        .tank-name { margin-top:11px; font-size:10px; font-weight:700; }
        .tank-litres { margin-top:4px; color:var(--ink); font:700 16px 'Space Mono',monospace; letter-spacing:-.07em; }
        .tank-litres span { color:var(--muted); font:400 9px 'DM Sans',sans-serif; letter-spacing:0; }
        .tank-track { height:5px; margin-top:10px; overflow:hidden; border-radius:99px; background:#DDE9DF; }
        .tank-track i { display:block; height:100%; border-radius:99px; }
        .tank-foot { display:flex; justify-content:space-between; margin-top:6px; color:var(--muted); font-size:8px; }
        .detail-card { display:flex; align-items:center; gap:10px; margin-top:9px; padding:11px; border:1px solid #BFD7C4; border-radius:14px; background:#EDF6EE; }
        .detail-card-copy { min-width:0; flex:1; }
        .detail-card-copy b { display:block; font-size:10px; }
        .detail-card-copy span { display:block; margin-top:3px; color:var(--muted); font-size:9px; }
        .inline-button { border:0; background:none; color:var(--green); font-size:9px; font-weight:700; cursor:pointer; }
        .task-empty { padding:18px 12px; border:1px dashed #B9D0BE; border-radius:15px; background:#EDF6EE; color:var(--muted); text-align:center; font-size:10px; line-height:1.45; }
         .report-list { display:grid; gap:8px; margin-top:10px; }
         .report-row { display:flex; align-items:center; gap:10px; width:100%; padding:12px; border:1px solid var(--line); border-radius:15px; background:rgba(252,253,249,.88); text-align:left; cursor:pointer; transition:transform .18s ease,border-color .18s ease,background .18s ease; }
         .report-row:hover { transform:translateY(-1px); border-color:#B5D2BC; background:#F7FBF6; }
         .report-icon { width:34px; height:34px; display:grid; place-items:center; flex:none; border-radius:11px; }
         .report-copy { min-width:0; flex:1; }
         .report-copy b { display:block; overflow:hidden; color:var(--ink); font-size:11px; text-overflow:ellipsis; white-space:nowrap; }
         .report-copy span { display:block; overflow:hidden; margin-top:4px; color:var(--muted); font-size:9px; text-overflow:ellipsis; white-space:nowrap; }
         .report-status { display:inline-flex; align-items:center; gap:4px; margin-top:7px; color:var(--green); font-size:8px; font-weight:700; }
         .report-status.review { color:var(--amber); }
         .report-arrow { flex:none; color:var(--green); }
         .report-view { animation:report-in .2s ease-out; }
         .report-view-head { display:flex; align-items:flex-start; gap:9px; }
         .back-button { width:31px; height:31px; display:grid; place-items:center; flex:none; border:1px solid var(--line); border-radius:10px; background:#F0F6F0; color:var(--green); cursor:pointer; }
         .report-view-kicker { color:var(--muted); text-transform:uppercase; letter-spacing:.13em; font-size:8px; font-weight:700; }
         .report-view-title { margin-top:4px; color:var(--ink); font-size:18px; line-height:1.05; letter-spacing:-.05em; }
         .report-view-period { margin-top:5px; color:var(--muted); font-size:9px; }
         .report-view-tools { display:flex; gap:7px; margin-top:14px; }
         .report-tool { display:inline-flex; align-items:center; justify-content:center; gap:5px; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:#F4F8F3; color:var(--green); font-size:9px; font-weight:700; cursor:pointer; }
         .report-tool.primary { border-color:var(--green); background:var(--green); color:#fff; }
         .report-summary { margin-top:14px; padding:12px; border-left:3px solid var(--green); border-radius:0 12px 12px 0; background:#EDF6EE; color:var(--muted); font-size:10px; line-height:1.45; }
         .report-metrics { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; margin-top:12px; }
         .report-metric { min-width:0; padding:10px 8px; border:1px solid var(--line); border-radius:12px; background:#FCFDF9; }
         .report-metric b { display:block; overflow:hidden; color:var(--ink); font:700 13px 'Space Mono',monospace; letter-spacing:-.08em; text-overflow:ellipsis; white-space:nowrap; }
         .report-metric span { display:block; overflow:hidden; margin-top:5px; color:var(--muted); font-size:8px; text-overflow:ellipsis; white-space:nowrap; }
         .report-sections { display:grid; gap:7px; margin-top:14px; }
         .report-section { padding:11px; border:1px solid var(--line); border-radius:13px; background:rgba(252,253,249,.82); }
         .report-section b { display:block; color:var(--ink); font-size:10px; }
         .report-section span { display:block; margin-top:4px; color:var(--muted); font-size:9px; line-height:1.4; }
         @keyframes report-in { from { opacity:.5; transform:translateX(9px) } to { opacity:1; transform:translateX(0) } }
        .bottom-nav { position:absolute; z-index:2; right:0; bottom:0; left:0; height:70px; display:flex; align-items:center; justify-content:space-around; border-top:1px solid var(--line); background:rgba(252,253,249,.95); backdrop-filter:blur(12px); }
        .nav-button { display:grid; justify-items:center; gap:4px; border:0; background:none; color:#8B9C93; font-size:8px; font-weight:700; cursor:pointer; }
        .nav-button.active { color:var(--green); }
        .nav-button.alert { color:#A56E1E; }
        .quick-button { width:43px; height:43px; display:grid; place-items:center; margin-top:-23px; border:4px solid var(--paper); border-radius:16px; background:var(--green); color:#fff; box-shadow:0 6px 15px rgba(23,106,69,.22); cursor:pointer; }
        .scrim { position:absolute; z-index:5; inset:0; display:flex; align-items:flex-end; background:rgba(13,38,28,.38); }
        .sheet { width:100%; padding:20px 18px 24px; border-radius:24px 24px 0 0; background:var(--card); box-shadow:0 -12px 30px rgba(19,55,35,.18); animation:sheet-in .2s ease-out; }
        .handle { width:38px; height:4px; margin:0 auto 17px; border-radius:99px; background:#D4E0D6; }
        .sheet-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
        .sheet h2 { margin:0; font-size:18px; letter-spacing:-.04em; }
        .sheet p { margin:4px 0 15px; color:var(--muted); font-size:10px; line-height:1.4; }
        .sheet .round-action { color:var(--ink); border-color:var(--line); background:#EEF4EE; }
        .sheet-row { display:flex; align-items:center; gap:10px; padding:11px; border:1px solid var(--line); border-radius:13px; background:#F4F8F3; }
        .sheet-row + .sheet-row { margin-top:7px; }
        .sheet-row-copy { flex:1; }
        .sheet-row-copy b { display:block; font-size:10px; }
        .sheet-row-copy span { display:block; margin-top:3px; color:var(--muted); font-size:9px; }
        @keyframes sheet-in { from { opacity:.4; transform:translateY(22px) } to { opacity:1; transform:translateY(0) } }
        @media (min-width:600px) { .desk-shell { max-width:450px; margin:auto; } }
      `}</style>

      <header className="masthead">
        <div className="mast-row">
          <div>
            <div className="eyebrow">Petrotrack / Station desk</div>
            <div className="mast-title">Lekki Phase 1</div>
            <div className="mast-sub">Station 04 · Wednesday, 14 June</div>
          </div>
          <div className="mast-actions">
            <button className="round-action" onClick={() => setNotice("No new alerts beyond the open dip review")} aria-label="View alerts"><Bell size={16} /></button>
            <button className="round-action" onClick={() => setNotice("More station actions opened")} aria-label="More actions"><MoreHorizontal size={17} /></button>
          </div>
        </div>
        <div className="sync-row"><i className="live-dot" /><span>{notice}</span><span className="timestamp">09:18</span></div>
      </header>

      <div className="desk-body">
        <div className="workspace-tabs" role="tablist" aria-label="Station workspaces">
          {([["dispatch", "Dispatch"], ["stock", "Stock room"], ["tasks", "Open tasks"], ["reports", "Reports"]] as const).map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => openTab(key)} role="tab" aria-selected={tab === key}>{label}</button>
          ))}
        </div>

        {tab === "dispatch" && (
          <>
            <section className="runway">
              <div className="runway-top">
                <div>
                  <div className="section-label">Operating runway</div>
                  <div className="runway-title">Ready for the <em>next handover.</em></div>
                  <p className="runway-copy">Sales pacing is healthy. Keep the AGO delivery and PMS variance in view.</p>
                </div>
                <div className="runway-score">72<span>% clear</span></div>
              </div>
              <div className="runway-bar"><i /></div>
              <div className="runway-foot"><span><strong>3</strong> of 4 checks covered</span><span>1 decision needed</span></div>
            </section>
            <div className="section-head"><div className="section-label">Work queue</div><button onClick={() => openTab("tasks")}>Open task view <ChevronRight size={12} /></button></div>
            <div className="search-box"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the station queue" /></div>
            <div className="filter-row">
              {([["all", "Everything"], ["action", "Needs action"], ["moving", "In motion"]] as const).map(([key, label]) => <button key={key} className={`filter-pill ${filter === key ? "active" : ""}`} onClick={() => setFilter(key)}>{label}</button>)}
            </div>
            <div className="work-list">
              {filteredWork.map((item) => {
                const Icon = iconFor(item.kind);
                const tone = toneFor(item.kind);
                return <div key={item.id} className={`work-row ${selectedWorkId === item.id ? "selected" : ""} ${item.state === "done" ? "done" : ""}`} onClick={() => setSelectedWorkId(item.id)} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedWorkId(item.id); }}>
                  <div className="work-icon" style={{ background: tone.bg, color: tone.fg }}>{item.state === "done" ? <CheckCircle2 size={15} /> : <Icon size={15} />}</div>
                  <div className="work-copy"><b>{item.title}</b><span>{item.detail}</span><div className="work-meta">{item.state === "done" ? <Check size={10} /> : <Clock3 size={10} />}{item.meta}</div></div>
                  <button className="work-check" onClick={(event) => { event.stopPropagation(); acknowledge(item); }} aria-label={item.state === "done" ? "Acknowledged" : "Acknowledge task"}>{item.state === "done" ? <Check size={13} /> : <ChevronRight size={13} />}</button>
                </div>;
              })}
              {filteredWork.length === 0 && <div className="task-empty">No queue items match that search. Try “delivery” or switch the filter.</div>}
            </div>
            {selectedWork && selectedWork.state !== "done" && <div className="detail-card"><AlertCircle size={15} color="#A56E1E" /><div className="detail-card-copy"><b>Decision desk</b><span>{selectedWork.id === "dip" ? "Confirm the PMS variance before the next shift." : "Keep this item visible until it is complete."}</span></div><button className="inline-button" onClick={() => acknowledge(selectedWork)}>Acknowledge</button></div>}
          </>
        )}

        {tab === "stock" && (
          <>
            <section className="runway">
              <div className="section-label">Stock room / live readings</div>
              <div className="runway-title">Every litre has a <em>next move.</em></div>
              <p className="runway-copy">Four active assets · 56,240 L and 1,840 kg on hand across the station.</p>
              <div className="runway-foot" style={{ marginTop: 14 }}><span><strong>1</strong> delivery due today</span><span>Last dip · 08:42</span></div>
            </section>
            <div className="section-head"><div className="section-label">All storage assets</div><span style={{ color: "var(--muted)", fontSize: 9 }}>Tap to inspect</span></div>
            <div className="tank-grid">
              {tanks.map((tank) => <button key={tank.id} className={`tank-tile ${selectedTankId === tank.id ? "selected" : ""}`} onClick={() => setSelectedTankId(tank.id)}>
                <div className="tank-tile-top"><div style={{ width: 23, height: 23, display: "grid", placeItems: "center", borderRadius: 8, background: `${tank.tone}18`, color: tank.tone }}><Fuel size={13} /></div><span className="tank-product">{tank.product}</span></div>
                <div className="tank-name">{tank.name}</div><div className="tank-litres">{tank.litres} <span>{tank.level}%</span></div><div className="tank-track"><i style={{ width: `${tank.level}%`, background: tank.tone }} /></div><div className="tank-foot"><span>{tank.capacity}</span><span>{tank.delivery}</span></div>
              </button>)}
            </div>
            <div className="detail-card"><Droplets size={15} color={selectedTank.tone} /><div className="detail-card-copy"><b>{selectedTank.name} · {selectedTank.product} selected</b><span>{selectedTank.litres} available · next delivery {selectedTank.delivery}</span></div><button className="inline-button" onClick={() => setShowTankSheet(true)}>Inspect</button></div>
          </>
        )}

        {tab === "tasks" && (
          <>
            <section className="runway">
              <div className="section-label">Open tasks / triage</div>
              <div className="runway-title">Make the next call <em>obvious.</em></div>
              <p className="runway-copy">Resolve, acknowledge, or leave a clean trail for the next operator.</p>
            </section>
            <div className="section-head"><div className="section-label">Unresolved queue</div><span style={{ color: "var(--amber)", fontSize: 9, fontWeight: 700 }}>{work.filter((item) => item.state === "action").length} need action</span></div>
            <div className="work-list">{work.filter((item) => item.state !== "done").map((item) => { const Icon = iconFor(item.kind); const tone = toneFor(item.kind); return <div key={item.id} className={`work-row ${selectedWorkId === item.id ? "selected" : ""}`} onClick={() => setSelectedWorkId(item.id)}><div className="work-icon" style={{ background: tone.bg, color: tone.fg }}><Icon size={15} /></div><div className="work-copy"><b>{item.title}</b><span>{item.detail}</span><div className="work-meta"><Clock3 size={10} />{item.meta}</div></div><button className="work-check" onClick={(event) => { event.stopPropagation(); acknowledge(item); }} aria-label="Acknowledge task"><Check size={13} /></button></div>; })}</div>
            {work.every((item) => item.state === "done") && <div className="task-empty"><CheckCircle2 size={18} style={{ verticalAlign: "middle", marginRight: 5 }} />Queue clear. The station is ready for handover.</div>}
            <div className="detail-card" style={{ marginTop: 12 }}><ClipboardList size={15} color="var(--green)" /><div className="detail-card-copy"><b>Handover checklist</b><span>3 of 4 checks covered · one decision remains</span></div><button className="inline-button" onClick={() => setNotice("Handover checklist marked for review")}>Review</button></div>
          </>
        )}

        {tab === "reports" && !selectedReport && (
          <>
            <section className="runway">
              <div className="section-label">Reports / station record</div>
              <div className="runway-title">See the full picture <em>on screen.</em></div>
              <p className="runway-copy">Open any report to review its contents here. Export is available only after you have viewed the report.</p>
            </section>
            <div className="section-head"><div className="section-label">Available reports</div><span style={{ color: "var(--muted)", fontSize: 9 }}>{reports.length} reports</span></div>
            <div className="report-list">
              {reports.map((report) => (
                <button key={report.id} className="report-row" onClick={() => openReport(report)} aria-label={`Open ${report.title}`}>
                  <div className="report-icon" style={{ background: `${report.accent}18`, color: report.accent }}><FileText size={16} /></div>
                  <div className="report-copy">
                    <b>{report.title}</b>
                    <span>{report.period} · {report.summary}</span>
                    <div className={`report-status ${report.status === "Needs review" ? "review" : ""}`}><CheckCircle2 size={10} />{report.status}</div>
                  </div>
                  <ChevronRight className="report-arrow" size={16} />
                </button>
              ))}
            </div>
          </>
        )}

        {tab === "reports" && selectedReport && (
          <section className="runway report-view">
            <div className="report-view-head">
              <button className="back-button" onClick={closeReport} aria-label="Back to reports"><ArrowLeft size={15} /></button>
              <div>
                <div className="report-view-kicker">Report detail · {selectedReport.status}</div>
                <div className="report-view-title">{selectedReport.title}</div>
                <div className="report-view-period">{selectedReport.period} · Lekki Phase 1 · Station 04</div>
              </div>
            </div>
            <div className="report-view-tools">
              <button className="report-tool primary" onClick={() => setNotice(`${selectedReport.title} is ready to export as PDF`)}><Download size={12} />Export PDF</button>
              <button className="report-tool" onClick={() => setNotice("Report link copied to the station desk")}><FileText size={12} />Share report</button>
            </div>
            <div className="report-summary">{selectedReport.summary}</div>
            <div className="report-metrics">
              {selectedReport.metrics.map(([label, value]) => <div className="report-metric" key={label}><b>{value}</b><span>{label}</span></div>)}
            </div>
            <div className="section-head" style={{ marginTop: 19 }}><div className="section-label">Report contents</div><span style={{ color: "var(--muted)", fontSize: 9 }}>Live view</span></div>
            <div className="report-sections">
              {selectedReport.sections.map(([title, detail]) => <div className="report-section" key={title}><b>{title}</b><span>{detail}</span></div>)}
            </div>
          </section>
        )}
      </div>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className={`nav-button ${tab === "dispatch" ? "active" : ""}`} onClick={() => openTab("dispatch")}><LayoutGrid size={18} /><span>Desk</span></button>
        <button className={`nav-button ${tab === "stock" ? "active" : ""}`} onClick={() => openTab("stock")}><Fuel size={18} /><span>Stock</span></button>
        <button className="quick-button" onClick={() => setShowTankSheet(true)} aria-label="Log station reading"><PackageCheck size={20} /></button>
        <button className={`nav-button ${tab === "tasks" ? "active" : "alert"}`} onClick={() => openTab("tasks")}><ClipboardList size={18} /><span>Tasks</span></button>
        <button className={`nav-button ${tab === "reports" ? "active" : ""}`} onClick={() => openTab("reports")}><FileText size={18} /><span>Reports</span></button>
      </nav>

      {showTankSheet && <div className="scrim" onClick={() => setShowTankSheet(false)}>
        <section className="sheet" onClick={(event) => event.stopPropagation()}>
          <div className="handle" />
          <div className="sheet-head"><div><h2>Log a station reading</h2><p>Choose the event you want to add to today's desk.</p></div><button className="round-action" onClick={() => setShowTankSheet(false)} aria-label="Close"><X size={16} /></button></div>
          <button className="sheet-row" onClick={() => { setShowTankSheet(false); setNotice("New tank dip started"); }}><div className="work-icon" style={{ background: "#E5F1E8", color: "var(--green)" }}><Droplets size={15} /></div><div className="sheet-row-copy"><b>Record tank dip</b><span>Capture readings across active assets</span></div><ChevronRight size={15} color="#8A9B92" /></button>
          <button className="sheet-row" onClick={() => { setShowTankSheet(false); setNotice("Delivery log started"); }}><div className="work-icon" style={{ background: "#E3EEF0", color: "var(--navy)" }}><Truck size={15} /></div><div className="sheet-row-copy"><b>Log a delivery</b><span>Check in a truck and reconcile quantity</span></div><ChevronRight size={15} color="#8A9B92" /></button>
          <button className="sheet-row" onClick={() => { setShowTankSheet(false); setNotice("Maintenance request started"); }}><div className="work-icon" style={{ background: "#F5E8E5", color: "#9A5149" }}><Wrench size={15} /></div><div className="sheet-row-copy"><b>Report maintenance</b><span>Flag a pump, nozzle, or site issue</span></div><ChevronRight size={15} color="#8A9B92" /></button>
        </section>
      </div>}
    </main>
  );
}