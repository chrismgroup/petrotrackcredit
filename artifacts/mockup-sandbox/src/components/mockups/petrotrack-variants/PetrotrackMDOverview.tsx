import React, { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Droplets,
  FileText,
  Flame,
  Fuel,
  LayoutDashboard,
  MessageSquare,
  MoreHorizontal,
  ShieldCheck,
  TrendingUp,
  Truck,
  UserCheck,
  Users,
  Wrench,
  X,
  BarChart3,
  Package,
} from "lucide-react";

/* ─── colour palette ──────────────────────────────────────────────────── */
const C = {
  ink:       "#161F1B",
  muted:     "#64786F",
  paper:     "#F0F4F0",
  card:      "#FAFDF8",
  line:      "#D8E5DA",
  /* forest */
  forestDark: "#122E24",
  forest:    "#176A45",
  forestMid: "#1E5A3B",
  forestLight:"#D9EFE3",
  /* amber / gold */
  amber:     "#A05C17",
  amberBg:   "#FEF3E2",
  amberLine: "#EDD49A",
  /* sapphire */
  navy:      "#1B3F6A",
  navyBg:    "#E6EDF8",
  navyLine:  "#B0C6E4",
  /* plum */
  plum:      "#6B3A8C",
  plumBg:    "#F3ECF9",
  plumLine:  "#C9AADF",
  /* crimson */
  crimson:   "#8C2020",
  crimsonBg: "#FDECEC",
  crimsonLine:"#E2AAAA",
  /* teal */
  teal:      "#196878",
  tealBg:    "#E4EEF0",
  tealLine:  "#9FC4CC",
};

/* ─── data ────────────────────────────────────────────────────────────── */
const kpis = [
  { label: "Revenue today",   value: "₦6.84m",   delta: "+12%",  icon: Banknote,    accent: C.amber,  bg: C.amberBg },
  { label: "Total fuel stock",value: "58,240 L",  delta: "82%",   icon: Fuel,        accent: C.forest, bg: C.forestLight },
  { label: "LPG on hand",     value: "1,840 kg",  delta: "46%",   icon: Flame,       accent: C.plum,   bg: C.plumBg },
  { label: "Stations active", value: "3 / 3",     delta: "100%",  icon: Building2,   accent: C.navy,   bg: C.navyBg },
];

type ActionKind = "dip" | "delivery" | "price" | "budget" | "account" | "maintenance";
interface ActionItem {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string;
  meta: string;
  accent: string;
  accentBg: string;
  accentLine: string;
  icon: React.ElementType;
}
const initialActions: ActionItem[] = [
  {
    id: "dip-1", kind: "dip",
    title: "Tank dip awaiting sign-off",
    detail: "PMS · variance +120 L above automatic reading",
    meta: "Submitted 08:42 · Adaeze",
    accent: C.amber, accentBg: C.amberBg, accentLine: C.amberLine, icon: Droplets,
  },
  {
    id: "delivery-1", kind: "delivery",
    title: "AGO delivery pending approval",
    detail: "18,000 L · TRK-4821 · Bay 2 · Lekki Phase 1",
    meta: "Checked in 09:05 · waybill on file",
    accent: C.navy, accentBg: C.navyBg, accentLine: C.navyLine, icon: Truck,
  },
  {
    id: "price-1", kind: "price",
    title: "Price proposal: AGO",
    detail: "₦945 → ₦960/L · proposed by Branch Manager",
    meta: "Submitted yesterday · awaiting MD review",
    accent: C.plum, accentBg: C.plumBg, accentLine: C.plumLine, icon: TrendingUp,
  },
  {
    id: "account-1", kind: "account",
    title: "Staff account activation",
    detail: "Chisom Eze · Attendant · Maitama Branch",
    meta: "Created 2 days ago · HR verified",
    accent: C.teal, accentBg: C.tealBg, accentLine: C.tealLine, icon: UserCheck,
  },
  {
    id: "maintenance-1", kind: "maintenance",
    title: "Urgent maintenance flag",
    detail: "Nozzle 03 · pressure test overdue · Lekki Phase 1",
    meta: "Flagged today · Maintenance team",
    accent: C.crimson, accentBg: C.crimsonBg, accentLine: C.crimsonLine, icon: Wrench,
  },
];

const tanks = [
  { name: "PMS · Tank 02", litres: "24,680 L", fill: 82, accent: C.forest },
  { name: "AGO · Tank 04", litres: "18,300 L", fill: 61, accent: C.navy },
  { name: "DPK · Tank 01", litres: "11,420 L", fill: 38, accent: C.amber },
  { name: "LPG · Cage A",  litres: "1,840 kg",  fill: 46, accent: C.plum },
];

const ops = [
  { label: "Shift opened",       state: "done",      detail: "Morning shift · Chinedu · 06:00",  icon: ClipboardCheck, accent: C.forest,  accentBg: C.forestLight },
  { label: "Tank dip readings",  state: "attention", detail: "3 submitted · PMS variance open",  icon: Droplets,       accent: C.amber,   accentBg: C.amberBg },
  { label: "AGO delivery",       state: "done",      detail: "18,000 L checked in · Bay 2",      icon: Truck,          accent: C.navy,    accentBg: C.navyBg },
  { label: "Maintenance watch",  state: "attention", detail: "Nozzle 03 · urgent flag open",      icon: Wrench,         accent: C.crimson, accentBg: C.crimsonBg },
  { label: "Team messages",      state: "done",      detail: "No unread messages",               icon: MessageSquare,  accent: C.forest,  accentBg: C.forestLight },
];

const financials = [
  { label: "Cash in bank",    value: "₦12.4m", accent: C.forest },
  { label: "Cash in hand",    value: "₦840k",  accent: C.amber },
  { label: "POS collected",   value: "₦2.1m",  accent: C.navy },
  { label: "Expenses today",  value: "₦128k",  accent: C.crimson },
  { label: "Gross margin",    value: "18.4%",  accent: C.plum },
  { label: "Open budgets",    value: "2",       accent: C.teal },
];

/* ─── component ─────────────────────────────────────────────────────── */
export default function PetrotrackMDOverview() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);

  const actions = initialActions.filter(a => !dismissed.has(a.id));
  const dismiss = (id: string) => {
    setDismissed(prev => new Set([...prev, id]));
    setNotice("Noted — removed from your inbox");
  };
  const approve = (a: ActionItem) => {
    dismiss(a.id);
    setNotice(`${a.title} approved`);
  };

  return (
    <main className="md-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=Space+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        button,input,textarea{font:inherit}

        .md-shell{
          --ink:${C.ink};--muted:${C.muted};--paper:${C.paper};--card:${C.card};
          --line:${C.line};--forest:${C.forest};--forestDark:${C.forestDark};
          width:100%;min-height:100%;overflow-x:hidden;position:relative;
          background:var(--paper);color:var(--ink);
          font-family:'DM Sans',sans-serif;font-size:13px;
        }

        /* grain */
        .md-shell::before{
          content:"";pointer-events:none;position:absolute;inset:0;z-index:0;
          opacity:.10;background-image:radial-gradient(${C.muted} .55px,transparent .55px);
          background-size:8px 8px;
          mask-image:linear-gradient(to bottom,rgba(0,0,0,.45),transparent 72%);
        }

        /* ── header ── */
        .hdr{
          position:relative;z-index:1;
          padding:22px 18px 24px;
          background:${C.forestDark};
          color:#F6FFF8;
          border-bottom-left-radius:30px;
          border-bottom-right-radius:30px;
          overflow:hidden;
        }
        .hdr::after{
          content:"";width:340px;height:340px;
          position:absolute;right:-170px;top:-210px;
          border:1px solid rgba(220,240,225,.14);border-radius:50%;
          box-shadow:0 0 0 32px rgba(220,240,225,.04),0 0 0 68px rgba(220,240,225,.022);
          pointer-events:none;
        }
        .hdr-top{display:flex;align-items:center;justify-content:space-between;gap:12px}
        .hdr-eyebrow{color:#9DCBA8;font-size:8.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}
        .hdr-name{margin-top:5px;font-size:24px;font-weight:700;letter-spacing:-.055em;line-height:1}
        .hdr-name em{color:#C5E2BE;font-family:'Instrument Serif',serif;font-weight:400;font-size:27px;letter-spacing:-.04em;font-style:italic}
        .hdr-sub{margin-top:7px;color:#A9C8B0;font-size:10px;line-height:1.4}
        .hdr-btn{
          flex:none;width:36px;height:36px;display:grid;place-items:center;
          border:1px solid rgba(255,255,255,.16);border-radius:12px;
          background:rgba(255,255,255,.07);color:#F0FFF4;cursor:pointer;
          position:relative;
        }
        .hdr-btn-badge{
          position:absolute;top:7px;right:7px;width:7px;height:7px;
          border-radius:50%;background:#F5C44E;border:1.5px solid ${C.forestDark};
        }
        .hdr-meta{display:flex;align-items:center;gap:7px;margin-top:18px;font-size:10px;color:#C4DEC8}
        .live-dot{width:7px;height:7px;border-radius:50%;background:#7BDE96;flex:none;
          box-shadow:0 0 0 4px rgba(123,222,150,.14)}
        .hdr-date{margin-left:auto;color:#8BAFA0;font:700 8.5px 'Space Mono',monospace;letter-spacing:.06em}

        /* ── kpi strip ── */
        .kpi-strip{
          position:relative;z-index:1;
          display:grid;grid-template-columns:1fr 1fr;gap:9px;
          padding:16px 16px 0;
        }
        .kpi-tile{
          padding:13px 12px 12px;border:1px solid var(--line);
          border-radius:18px;background:var(--card);
          box-shadow:0 4px 16px rgba(30,70,50,.05);
        }
        .kpi-icon{
          width:30px;height:30px;display:grid;place-items:center;
          border-radius:10px;flex:none;
        }
        .kpi-value{margin-top:9px;font:700 19px 'Space Mono',monospace;letter-spacing:-.06em;line-height:1}
        .kpi-label{margin-top:4px;font-size:9px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.1em}
        .kpi-delta{
          display:inline-flex;align-items:center;gap:3px;
          margin-top:7px;font-size:8.5px;font-weight:700;
          padding:3px 6px;border-radius:6px;
        }

        /* ── section chrome ── */
        .section{position:relative;z-index:1;padding:18px 16px 0}
        .sec-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:11px}
        .sec-label{font-size:8.5px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)}
        .sec-action{display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;color:var(--forest);background:none;border:0;cursor:pointer;padding:0}

        /* ── action inbox ── */
        .inbox{display:grid;gap:8px}
        .inbox-item{
          display:flex;align-items:flex-start;gap:10px;
          padding:12px 11px;border-radius:16px;border-width:1px;border-style:solid;
          background:var(--card);cursor:pointer;
          transition:transform .15s ease,box-shadow .15s ease;
        }
        .inbox-item:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(22,60,40,.08)}
        .inbox-icon{width:32px;height:32px;display:grid;place-items:center;flex:none;border-radius:10px}
        .inbox-copy{flex:1;min-width:0}
        .inbox-title{font-size:11px;font-weight:700;color:var(--ink)}
        .inbox-detail{font-size:9px;color:var(--muted);margin-top:2px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .inbox-meta{font-size:8.5px;color:var(--muted);margin-top:5px;font-style:italic}
        .inbox-actions{display:flex;gap:6px;margin-top:8px}
        .inbox-btn{
          display:inline-flex;align-items:center;gap:4px;
          padding:6px 9px;border-radius:8px;border:1px solid;
          font-size:9px;font-weight:700;cursor:pointer;
        }
        .inbox-dismiss{width:26px;height:26px;display:grid;place-items:center;flex:none;
          border:1px solid var(--line);border-radius:8px;background:transparent;
          color:var(--muted);cursor:pointer;margin-top:2px}

        /* ── stock bars ── */
        .stock-grid{display:grid;gap:9px}
        .stock-row{
          padding:12px 13px;border:1px solid var(--line);
          border-radius:15px;background:var(--card);
        }
        .stock-row-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
        .stock-name{font-size:10px;font-weight:700;color:var(--ink)}
        .stock-val{font:700 13px 'Space Mono',monospace;letter-spacing:-.04em}
        .stock-track{height:6px;border-radius:99px;background:${C.line};overflow:hidden}
        .stock-fill{height:100%;border-radius:99px;transition:width .3s ease}
        .stock-pct{font-size:8px;color:var(--muted);margin-top:5px;font-weight:600}

        /* ── ops health ── */
        .ops-list{display:grid;gap:7px}
        .ops-row{
          display:flex;align-items:center;gap:9px;
          padding:10px 11px;border:1px solid var(--line);
          border-radius:14px;background:var(--card);
        }
        .ops-row.attention{border-color:${C.amberLine};background:${C.amberBg}}
        .ops-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;flex:none}
        .ops-copy{flex:1;min-width:0}
        .ops-title{font-size:10px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ops-detail{font-size:9px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .ops-badge{
          flex:none;font-size:8px;font-weight:700;padding:3px 7px;
          border-radius:6px;white-space:nowrap;
        }

        /* ── financial grid ── */
        .fin-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
        .fin-cell{
          padding:11px 10px;border:1px solid var(--line);
          border-radius:14px;background:var(--card);
        }
        .fin-label{font-size:8.5px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.09em}
        .fin-value{margin-top:6px;font:700 15px 'Space Mono',monospace;letter-spacing:-.05em;line-height:1}

        /* ── note card ── */
        .note-card{
          margin:16px 16px 0;padding:13px 13px;
          border:1px dashed ${C.forestLight};border-radius:16px;
          background:rgba(217,239,227,.35);
          display:flex;align-items:center;gap:10px;cursor:pointer;
        }
        .note-card:hover{background:rgba(217,239,227,.55)}
        .note-icon{width:32px;height:32px;border-radius:10px;background:${C.forestLight};
          color:${C.forest};display:grid;place-items:center;flex:none}
        .note-copy{flex:1;min-width:0}
        .note-title{font-size:11px;font-weight:700}
        .note-desc{font-size:9px;color:var(--muted);margin-top:2px;line-height:1.35}

        /* ── toast ── */
        .toast{
          position:fixed;z-index:9;top:16px;left:50%;transform:translateX(-50%);
          min-width:240px;max-width:340px;
          display:flex;align-items:center;gap:8px;
          padding:9px 12px;border-radius:12px;
          border:1px solid ${C.forestLight};background:#ECF8EF;color:#1F5C38;
          font-size:10px;font-weight:600;
          box-shadow:0 4px 16px rgba(22,60,40,.14);
          animation:tst .2s ease-out;
        }
        @keyframes tst{from{opacity:0;transform:translateX(-50%) translateY(-6px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}

        /* ── sheet ── */
        .scrim{position:fixed;z-index:8;inset:0;background:rgba(10,30,20,.38);display:flex;align-items:flex-end}
        .sheet{width:100%;padding:20px 18px 28px;border-radius:26px 26px 0 0;
          background:var(--card);box-shadow:0 -12px 32px rgba(16,48,32,.18);
          animation:sht .22s ease-out}
        @keyframes sht{from{opacity:.5;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
        .handle{width:38px;height:4px;border-radius:99px;background:${C.line};margin:0 auto 18px}
        .sheet h2{font-size:18px;font-weight:700;letter-spacing:-.04em}
        .sheet p{font-size:10px;color:var(--muted);margin-top:4px;margin-bottom:15px}
        .sheet textarea{width:100%;min-height:90px;resize:none;padding:11px;
          border:1px solid var(--line);border-radius:12px;outline:none;
          background:${C.paper};color:var(--ink);font:12px 'DM Sans',sans-serif}
        .sheet textarea:focus{border-color:${C.forest};box-shadow:0 0 0 3px rgba(23,106,69,.1)}
        .sheet-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}
        .sft-cancel{padding:9px 14px;border:1px solid var(--line);border-radius:10px;
          background:transparent;color:var(--muted);font-size:10px;font-weight:700;cursor:pointer}
        .sft-save{padding:9px 14px;border:0;border-radius:10px;
          background:${C.forest};color:#fff;font-size:10px;font-weight:700;cursor:pointer;
          display:flex;align-items:center;gap:5px}

        /* ── bottom spacer ── */
        .spacer{height:28px}

        @media(min-width:600px){.md-shell{max-width:450px;margin:auto}}
      `}</style>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="hdr">
        <div className="hdr-top">
          <div>
            <div className="hdr-eyebrow">Petrotrack · Managing Director</div>
            <div className="hdr-name">Good morning, <em>MD.</em></div>
            <div className="hdr-sub">Lekki Phase 1 · 3 stations online · Wed 14 Jun</div>
          </div>
          <button className="hdr-btn" onClick={() => setNotice("Notification panel opened")}>
            <Bell size={17} />
            <span className="hdr-btn-badge" />
          </button>
        </div>
        <div className="hdr-meta">
          <i className="live-dot" />
          <span>All stations synced · <strong style={{ color: "#fff" }}>5 items</strong> need your attention</span>
          <span className="hdr-date">09:18</span>
        </div>
      </header>

      {/* ── KPI tiles ──────────────────────────────────────────────── */}
      <div className="kpi-strip">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div className="kpi-tile" key={k.label}>
              <div className="kpi-icon" style={{ background: k.bg }}>
                <Icon size={16} color={k.accent} />
              </div>
              <div className="kpi-value" style={{ color: k.accent }}>{k.value}</div>
              <div className="kpi-label">{k.label}</div>
              <div className="kpi-delta" style={{ background: k.bg, color: k.accent }}>
                <ArrowUpRight size={10} />{k.delta}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MD Action Inbox ─────────────────────────────────────────── */}
      <section className="section">
        <div className="sec-head">
          <span className="sec-label">Action required · {actions.length}</span>
          <button className="sec-action" onClick={() => setNotice("Full inbox opened")}>
            View all <ChevronRight size={11} />
          </button>
        </div>
        <div className="inbox">
          {actions.length === 0 && (
            <div style={{ padding: "18px 14px", border: `1px dashed ${C.line}`, borderRadius: 15, background: C.card, color: C.muted, textAlign: "center", fontSize: 10 }}>
              <CheckCircle2 size={18} color={C.forest} style={{ display: "block", margin: "0 auto 7px" }} />
              Your inbox is clear — nothing needs a decision right now.
            </div>
          )}
          {actions.map(a => {
            const Icon = a.icon;
            return (
              <div
                className="inbox-item"
                key={a.id}
                style={{ borderColor: a.accentLine, background: a.accentBg + "AA" }}
              >
                <div className="inbox-icon" style={{ background: a.accentBg, color: a.accent }}>
                  <Icon size={15} />
                </div>
                <div className="inbox-copy">
                  <div className="inbox-title">{a.title}</div>
                  <div className="inbox-detail">{a.detail}</div>
                  <div className="inbox-meta">{a.meta}</div>
                  <div className="inbox-actions">
                    <button
                      className="inbox-btn"
                      style={{ background: a.accent, borderColor: a.accent, color: "#fff" }}
                      onClick={() => approve(a)}
                    >
                      <CheckCircle2 size={10} />
                      {a.kind === "dip" ? "Approve dip" :
                       a.kind === "delivery" ? "Approve delivery" :
                       a.kind === "price" ? "Approve price" :
                       a.kind === "account" ? "Activate account" :
                       "Acknowledge"}
                    </button>
                    <button
                      className="inbox-btn"
                      style={{ background: "transparent", borderColor: a.accentLine, color: a.accent }}
                      onClick={() => setNotice(`${a.title} · opened for review`)}
                    >
                      Review <ArrowRight size={10} />
                    </button>
                  </div>
                </div>
                <button className="inbox-dismiss" onClick={() => dismiss(a.id)} aria-label="Dismiss">
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Stock overview ──────────────────────────────────────────── */}
      <section className="section">
        <div className="sec-head">
          <span className="sec-label">Tank stock · live</span>
          <button className="sec-action" onClick={() => setNotice("Inventory screen opened")}>
            Full inventory <ChevronRight size={11} />
          </button>
        </div>
        <div className="stock-grid">
          {tanks.map(t => (
            <div className="stock-row" key={t.name}>
              <div className="stock-row-top">
                <span className="stock-name">{t.name}</span>
                <span className="stock-val" style={{ color: t.accent }}>{t.litres}</span>
              </div>
              <div className="stock-track">
                <div className="stock-fill" style={{ width: `${t.fill}%`, background: t.accent }} />
              </div>
              <div className="stock-pct">{t.fill}% of capacity</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Operational health ─────────────────────────────────────── */}
      <section className="section">
        <div className="sec-head">
          <span className="sec-label">Station operations · today</span>
          <button className="sec-action" onClick={() => setNotice("Operations screen opened")}>
            Open ops <ChevronRight size={11} />
          </button>
        </div>
        <div className="ops-list">
          {ops.map(o => {
            const Icon = o.icon;
            const isDone = o.state === "done";
            const isAttn = o.state === "attention";
            return (
              <div
                className={`ops-row${isAttn ? " attention" : ""}`}
                key={o.label}
              >
                <div className="ops-icon" style={{ background: o.accentBg, color: o.accent }}>
                  {isDone ? <CheckCircle2 size={14} /> : <Icon size={14} />}
                </div>
                <div className="ops-copy">
                  <div className="ops-title">{o.label}</div>
                  <div className="ops-detail">{o.detail}</div>
                </div>
                <div
                  className="ops-badge"
                  style={{
                    background: isDone ? C.forestLight : C.amberBg,
                    color: isDone ? C.forest : C.amber,
                  }}
                >
                  {isDone ? "Clear" : "Review"}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Financial pulse ─────────────────────────────────────────── */}
      <section className="section">
        <div className="sec-head">
          <span className="sec-label">Financial pulse · today</span>
          <button className="sec-action" onClick={() => setNotice("Finance screen opened")}>
            Full view <ChevronRight size={11} />
          </button>
        </div>
        <div className="fin-grid">
          {financials.map(f => (
            <div className="fin-cell" key={f.label}>
              <div className="fin-label">{f.label}</div>
              <div className="fin-value" style={{ color: f.accent }}>{f.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Handover note ─────────────────────────────────────────────── */}
      <div className="note-card" onClick={() => setNoteOpen(true)}>
        <div className="note-icon"><FileText size={16} /></div>
        <div className="note-copy">
          <div className="note-title">Station handover notes</div>
          <div className="note-desc">Morning shift · Lekki Phase 1 · PMS variance flagged by morning team</div>
        </div>
        <ChevronRight size={15} color={C.forest} />
      </div>

      <div className="spacer" />

      {/* ── Toast ── */}
      {notice && (
        <div className="toast" onClick={() => setNotice("")}>
          <ShieldCheck size={13} />
          {notice}
          <X size={11} style={{ marginLeft: "auto", cursor: "pointer", opacity: .6 }} />
        </div>
      )}

      {/* ── Note composer ── */}
      {noteOpen && (
        <div className="scrim" onClick={() => setNoteOpen(false)}>
          <section className="sheet" onClick={e => e.stopPropagation()}>
            <div className="handle" />
            <h2>Add a director's note</h2>
            <p>This note will be visible to station managers and accountants.</p>
            <textarea placeholder="e.g. Hold off on the AGO price change until competitor survey is back…" autoFocus />
            <div className="sheet-foot">
              <button className="sft-cancel" onClick={() => setNoteOpen(false)}>Cancel</button>
              <button className="sft-save" onClick={() => { setNoteOpen(false); setNotice("Director's note saved"); }}>
                <FileText size={12} /> Save note
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
