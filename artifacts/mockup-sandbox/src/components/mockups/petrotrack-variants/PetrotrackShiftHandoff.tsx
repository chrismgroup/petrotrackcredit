import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  FileText,
  Fuel,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  ShieldCheck,
  Truck,
  UserRound,
  Wrench,
  X,
} from "lucide-react";

type CheckpointState = "done" | "attention" | "upcoming";

type Checkpoint = {
  id: string;
  time: string;
  title: string;
  detail: string;
  owner: string;
  state: CheckpointState;
  icon: typeof Fuel;
  note?: string;
};

const initialCheckpoints: Checkpoint[] = [
  {
    id: "opening",
    time: "06:00",
    title: "Morning shift opened",
    detail: "Attendance and cash float recorded",
    owner: "Chinedu",
    state: "done",
    icon: UserRound,
  },
  {
    id: "dip",
    time: "08:42",
    title: "Tank dip readings",
    detail: "Three readings submitted · awaiting your sign-off",
    owner: "Adaeze",
    state: "attention",
    icon: Fuel,
    note: "PMS variance is +120 L against the automatic reading. Confirm before handover.",
  },
  {
    id: "delivery",
    time: "09:05",
    title: "AGO delivery checked in",
    detail: "Bay 2 · TRK-4821 · 18,000 L expected",
    owner: "Driver verified",
    state: "done",
    icon: Truck,
  },
  {
    id: "nozzle",
    time: "11:30",
    title: "Nozzle 03 service window",
    detail: "Pressure test and seal inspection",
    owner: "Maintenance",
    state: "upcoming",
    icon: Wrench,
  },
];

const toneFor = (state: CheckpointState) => {
  if (state === "done") return { bg: "#DFF0E5", fg: "#226746", label: "Signed off" };
  if (state === "attention") return { bg: "#F9E9C9", fg: "#93651B", label: "Needs review" };
  return { bg: "#E4EDF1", fg: "#376A7D", label: "Upcoming" };
};

export default function PetrotrackShiftHandoff() {
  const [checkpoints, setCheckpoints] = useState(initialCheckpoints);
  const [expandedId, setExpandedId] = useState("dip");
  const [showComposer, setShowComposer] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [handoverReady, setHandoverReady] = useState(false);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("2 checkpoints still need attention");

  const reviewCount = useMemo(
    () => checkpoints.filter((checkpoint) => checkpoint.state === "attention").length,
    [checkpoints],
  );
  const doneCount = useMemo(
    () => checkpoints.filter((checkpoint) => checkpoint.state === "done").length,
    [checkpoints],
  );

  function signOff(id: string) {
    setCheckpoints((current) =>
      current.map((checkpoint) =>
        checkpoint.id === id ? { ...checkpoint, state: "done", note: undefined } : checkpoint,
      ),
    );
    setExpandedId(id);
    setToast("Checkpoint signed off · handover progress updated");
  }

  function addHandoverNote() {
    const trimmed = note.trim();
    if (!trimmed) {
      setToast("Write a short note before adding it");
      return;
    }
    setToast("Handover note added to the shift log");
    setNote("");
    setShowComposer(false);
  }

  function markReady() {
    if (reviewCount > 0) {
      setToast("Resolve the tank dip review before handing over");
      setExpandedId("dip");
      return;
    }
    setHandoverReady(true);
    setToast("Shift marked ready for handover");
  }

  return (
    <main className="handoff-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Instrument+Serif:ital@0;1&display=swap');
        * { box-sizing: border-box; }
        .handoff-shell {
          --ink: #18352f;
          --muted: #71847d;
          --paper: #f2f6f1;
          --card: #fbfcf8;
          --line: #dce8df;
          --green: #176a45;
          --green-dark: #173e32;
          width: 100%;
          min-height: 100%;
          position: relative;
          overflow: hidden;
          background: var(--paper);
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
        }
        .handoff-shell:before {
          content: "";
          pointer-events: none;
          position: absolute;
          inset: 0;
          opacity: .16;
          background-image: radial-gradient(#86a192 .65px, transparent .65px);
          background-size: 9px 9px;
          mask-image: linear-gradient(to bottom, rgba(0,0,0,.34), transparent 85%);
        }
        button { font-family: inherit; }
        .hero {
          position: relative;
          padding: 23px 20px 25px;
          color: #f6fff7;
          background: var(--green-dark);
          border-bottom-left-radius: 30px;
          border-bottom-right-radius: 30px;
          overflow: hidden;
        }
        .hero:after {
          content: "";
          width: 315px;
          height: 315px;
          position: absolute;
          right: -166px;
          top: -205px;
          border: 1px solid rgba(201,235,207,.2);
          border-radius: 50%;
          box-shadow: 0 0 0 28px rgba(201,235,207,.04), 0 0 0 58px rgba(201,235,207,.025);
        }
        .topline, .split { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .eyebrow {
          color: #afd2b7;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .16em;
          text-transform: uppercase;
        }
        .hero h1 {
          margin: 7px 0 0;
          max-width: 260px;
          font-size: 27px;
          line-height: 1.01;
          letter-spacing: -.06em;
        }
        .hero h1 em {
          color: #c5e2be;
          font-family: 'Instrument Serif', Georgia, serif;
          font-size: 31px;
          font-weight: 400;
          letter-spacing: -.04em;
        }
        .hero-sub {
          margin: 9px 0 0;
          color: #b7d0bf;
          font-size: 11px;
          line-height: 1.45;
        }
        .round-button {
          width: 36px;
          height: 36px;
          display: grid;
          flex: none;
          place-items: center;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 12px;
          background: rgba(255,255,255,.08);
          color: #f6fff7;
          cursor: pointer;
        }
        .round-button:active, .action-button:active, .checkpoint:active { transform: scale(.98); }
        .shift-meta {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 20px;
          color: #d2e6d4;
          font-size: 10px;
        }
        .shift-meta strong { color: #fff; font-weight: 700; }
        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #76dc96;
          box-shadow: 0 0 0 4px rgba(118,220,150,.12);
        }
        .shift-date {
          margin-left: auto;
          color: #9bbba3;
          font: 9px 'Space Mono', monospace;
        }
        .body { position: relative; padding: 18px 18px 93px; }
        .handover-card {
          padding: 16px;
          border: 1px solid var(--line);
          border-radius: 20px;
          background: rgba(251,252,248,.9);
          box-shadow: 0 8px 26px rgba(36,72,48,.055);
        }
        .section-label {
          color: var(--muted);
          font-size: 9px;
          font-weight: 700;
          letter-spacing: .14em;
          text-transform: uppercase;
        }
        .progress-row { margin-top: 13px; display: flex; align-items: end; justify-content: space-between; gap: 12px; }
        .progress-number { font: 700 26px 'Space Mono', monospace; letter-spacing: -.08em; }
        .progress-number span { color: var(--muted); font: 400 11px 'DM Sans', sans-serif; letter-spacing: 0; }
        .progress-copy { max-width: 175px; color: var(--muted); font-size: 10px; line-height: 1.4; text-align: right; }
        .progress-track { height: 7px; margin-top: 13px; overflow: hidden; border-radius: 10px; background: #e3ece4; }
        .progress-fill { height: 100%; border-radius: 10px; background: #319363; transition: width .25s ease; }
        .legend { display: flex; gap: 13px; margin-top: 14px; color: var(--muted); font-size: 9px; }
        .legend-item { display: flex; align-items: center; gap: 5px; }
        .legend-dot { width: 7px; height: 7px; border-radius: 50%; }
        .legend-dot.green { background: #319363; }
        .legend-dot.amber { background: #d69a35; }
        .legend-dot.blue { background: #7295a2; }
        .block-heading { display: flex; align-items: center; justify-content: space-between; margin: 24px 2px 10px; }
        .day-stamp { color: var(--muted); font: 9px 'Space Mono', monospace; }
        .timeline { display: grid; gap: 8px; }
        .checkpoint {
          width: 100%;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px 11px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: rgba(251,252,248,.84);
          text-align: left;
          cursor: pointer;
          transition: transform .18s ease, border-color .18s ease, background .18s ease;
        }
        .checkpoint:hover { transform: translateY(-1px); border-color: #b7d4be; }
        .checkpoint.is-attention { border-color: #e7c98d; background: #fffaf0; }
        .checkpoint.is-done { background: rgba(251,252,248,.65); }
        .checkpoint-time { width: 36px; padding-top: 3px; color: var(--muted); font: 9px 'Space Mono', monospace; flex: none; }
        .checkpoint-icon {
          width: 31px; height: 31px; display: grid; place-items: center; flex: none;
          border-radius: 10px;
        }
        .checkpoint-copy { min-width: 0; flex: 1; }
        .checkpoint-title { display: block; color: var(--ink); font-size: 11px; font-weight: 700; }
        .checkpoint-detail { display: block; margin-top: 3px; overflow: hidden; color: var(--muted); font-size: 9px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
        .state-label { display: inline-flex; align-items: center; gap: 4px; margin-top: 7px; color: #527469; font-size: 9px; font-weight: 700; }
        .state-label.attention { color: #93651b; }
        .state-label.upcoming { color: #5d8090; }
        .chevron { color: #8aa097; }
        .checkpoint-detail-panel {
          margin: -8px 0 0;
          padding: 11px 13px 12px 58px;
          border: 1px solid var(--line);
          border-top: 0;
          border-radius: 0 0 15px 15px;
          background: rgba(246,250,245,.9);
          color: var(--muted);
          font-size: 10px;
          line-height: 1.45;
          animation: reveal .18s ease-out;
        }
        @keyframes reveal { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .panel-actions { display: flex; gap: 7px; margin-top: 10px; }
        .action-button {
          display: inline-flex; align-items: center; justify-content: center; gap: 6px;
          padding: 8px 10px; border: 1px solid #cadbce; border-radius: 10px;
          background: #fbfcf8; color: var(--green); font-size: 10px; font-weight: 700; cursor: pointer;
        }
        .action-button.primary { border-color: var(--green); background: var(--green); color: #fff; }
        .action-button.subtle { color: #738780; }
        .note-card {
          display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 12px;
          border: 1px dashed #b9d0be; border-radius: 15px; background: #eef6ee; color: var(--green);
        }
        .note-card-copy { min-width: 0; flex: 1; }
        .note-card-copy b { display: block; font-size: 11px; }
        .note-card-copy span { display: block; margin-top: 3px; color: var(--muted); font-size: 9px; line-height: 1.35; }
        .text-button { border: 0; padding: 4px 0; background: none; color: var(--green); font-size: 10px; font-weight: 700; cursor: pointer; }
        .bottom-bar {
          position: absolute; z-index: 2; right: 0; bottom: 0; left: 0; height: 76px;
          display: flex; align-items: center; gap: 9px; padding: 12px 18px;
          border-top: 1px solid var(--line); background: rgba(251,252,248,.95); backdrop-filter: blur(12px);
        }
        .bottom-bar .action-button { height: 42px; }
        .bottom-bar .action-button.primary { flex: 1; }
        .ready-icon { color: #2e905c; }
        .toast {
          position: absolute; z-index: 4; top: 167px; right: 18px; left: 18px;
          display: flex; align-items: center; gap: 7px; padding: 9px 11px;
          border: 1px solid #b7d9c1; border-radius: 11px; background: #ecf8ef; color: #296440;
          font-size: 10px; animation: toast-in .2s ease-out;
        }
        @keyframes toast-in { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
        .sheet-scrim {
          position: absolute; z-index: 5; inset: 0; display: flex; align-items: flex-end;
          background: rgba(13,38,28,.38);
        }
        .sheet {
          width: 100%; padding: 20px 18px 25px; border-radius: 25px 25px 0 0; background: var(--card);
          box-shadow: 0 -12px 30px rgba(19,55,35,.18); animation: sheet-in .22s ease-out;
        }
        @keyframes sheet-in { from { opacity: .5; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        .handle { width: 38px; height: 4px; margin: 0 auto 18px; border-radius: 9px; background: #d4e0d6; }
        .sheet h2 { margin: 0; font-size: 18px; letter-spacing: -.04em; }
        .sheet p { margin: 4px 0 16px; color: var(--muted); font-size: 11px; }
        .sheet textarea { width: 100%; min-height: 90px; resize: none; padding: 11px; border: 1px solid var(--line); border-radius: 13px; outline: none; background: #f4f8f3; color: var(--ink); font: 11px 'DM Sans', sans-serif; }
        .sheet textarea:focus { border-color: #83b795; box-shadow: 0 0 0 3px rgba(62,146,95,.1); }
        .sheet-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
        @media (min-width: 600px) { .handoff-shell { max-width: 450px; margin: auto; } }
      `}</style>

      <header className="hero">
        <div className="topline">
          <div>
            <div className="eyebrow">Petrotrack / Shift handoff</div>
            <div className="hero-sub">Lekki Phase 1 · Station 04</div>
          </div>
          <button className="round-button" onClick={() => { setShowAlerts((value) => !value); setToast("No new alerts beyond the open dip review"); }} aria-label="View alerts">
            <Bell size={17} />
          </button>
        </div>
        <h1>Leave the station <em>clear.</em></h1>
        <p className="hero-sub">A sign-off trail for the person taking over after you.</p>
        <div className="shift-meta">
          <i className="live-dot" />
          <span><strong>Morning shift</strong> · Chinedu</span>
          <span className="shift-date">14 JUN · 09:18</span>
        </div>
      </header>

      <div className="body">
        <section className="handover-card">
          <div className="section-label">Handover readiness</div>
          <div className="progress-row">
            <div className="progress-number">{doneCount}<span> / {checkpoints.length} signed off</span></div>
            <div className="progress-copy">{handoverReady ? "Ready for the next operator." : reviewCount ? "One reading needs your decision before you go." : "Every checkpoint is accounted for."}</div>
          </div>
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(doneCount / checkpoints.length) * 100}%` }} /></div>
          <div className="legend">
            <div className="legend-item"><i className="legend-dot green" />Signed off</div>
            <div className="legend-item"><i className="legend-dot amber" />Needs review</div>
            <div className="legend-item"><i className="legend-dot blue" />Upcoming</div>
          </div>
        </section>

        <div className="block-heading">
          <div className="section-label">Shift checkpoints</div>
          <span className="day-stamp">WED · 14 JUN</span>
        </div>

        <section className="timeline" aria-label="Shift checkpoints">
          {checkpoints.map((checkpoint) => {
            const Icon = checkpoint.icon;
            const tone = toneFor(checkpoint.state);
            const expanded = expandedId === checkpoint.id;
            return (
              <React.Fragment key={checkpoint.id}>
                <button
                  className={`checkpoint ${checkpoint.state === "attention" ? "is-attention" : ""} ${checkpoint.state === "done" ? "is-done" : ""}`}
                  onClick={() => setExpandedId(expanded ? "" : checkpoint.id)}
                  aria-expanded={expanded}
                >
                  <span className="checkpoint-time">{checkpoint.time}</span>
                  <span className="checkpoint-icon" style={{ background: tone.bg, color: tone.fg }}>
                    {checkpoint.state === "done" ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                  </span>
                  <span className="checkpoint-copy">
                    <span className="checkpoint-title">{checkpoint.title}</span>
                    <span className="checkpoint-detail">{checkpoint.detail}</span>
                    <span className={`state-label ${checkpoint.state}`}>
                      {checkpoint.state === "attention" ? <AlertTriangle size={11} /> : checkpoint.state === "done" ? <Check size={11} /> : <Clock3 size={11} />}
                      {tone.label} · {checkpoint.owner}
                    </span>
                  </span>
                  <span className="chevron">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                </button>
                {expanded && (
                  <div className="checkpoint-detail-panel">
                    {checkpoint.note || (checkpoint.state === "done" ? "Verified and added to the station log." : "This checkpoint will appear in the next operator's brief.")}
                    {checkpoint.state === "attention" && (
                      <div className="panel-actions">
                        <button className="action-button primary" onClick={(event) => { event.stopPropagation(); signOff(checkpoint.id); }}><Check size={13} /> Sign off reading</button>
                        <button className="action-button subtle" onClick={(event) => { event.stopPropagation(); setToast("Review kept open for the next operator"); }}>Keep open</button>
                      </div>
                    )}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </section>

        <section className="note-card">
          <FileText size={17} />
          <div className="note-card-copy"><b>Leave a handover note</b><span>Add the context that numbers cannot: what to watch, what changed.</span></div>
          <button className="text-button" onClick={() => setShowComposer(true)}>Add note <ArrowRight size={11} style={{ verticalAlign: "middle" }} /></button>
        </section>
      </div>

      <footer className="bottom-bar">
        <button className="action-button" onClick={() => setShowComposer(true)} aria-label="Add note"><MessageSquareText size={16} /></button>
        <button className="action-button primary" onClick={markReady}>
          {handoverReady ? <><CheckCircle2 className="ready-icon" size={16} /> Handover ready</> : <><ClipboardCheck size={16} /> Mark shift ready</>}
        </button>
        <button className="action-button" onClick={() => setToast("More shift actions opened")} aria-label="More actions"><MoreHorizontal size={17} /></button>
      </footer>

      {showAlerts && (
        <div className="toast" role="status"><ShieldCheck size={14} /> {toast}</div>
      )}
      {!showAlerts && toast && (
        <div className="toast" role="status"><AlertTriangle size={14} /> {toast}</div>
      )}

      {showComposer && (
        <div className="sheet-scrim" onClick={() => setShowComposer(false)}>
          <section className="sheet" onClick={(event) => event.stopPropagation()}>
            <div className="handle" />
            <div className="split">
              <div><h2>Add to the next shift's brief</h2><p>Keep it short. The note will sit beside today's checkpoint trail.</p></div>
              <button className="round-button" style={{ background: "#eef4ee", color: "var(--ink)", borderColor: "var(--line)" }} onClick={() => setShowComposer(false)} aria-label="Close"><X size={17} /></button>
            </div>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. PMS reading is trending slightly above the automatic dip..." autoFocus />
            <div className="sheet-footer">
              <button className="action-button subtle" onClick={() => setShowComposer(false)}>Cancel</button>
              <button className="action-button primary" onClick={addHandoverNote}><Plus size={13} /> Add note</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}