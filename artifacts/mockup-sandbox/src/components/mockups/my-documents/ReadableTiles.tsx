import './_group.css';
import './ReadableTiles.css';
import { useState, type CSSProperties } from 'react';
import {
  ArrowUpRight,
  Bell,
  ChevronRight,
  FileText,
  Hammer,
  Library,
  Mail,
  NotebookTabs,
  Scale,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';

const areas = [
  {
    label: 'Compliance',
    eyebrow: 'Compliance Folder',
    icon: ShieldCheck,
    count: '12 files',
    note: '2 due soon',
    tint: 'sage',
  },
  {
    label: 'Legal Documents',
    eyebrow: 'Legal Documents Folder',
    icon: Scale,
    count: '8 files',
    note: 'Reviewed 06 Jun',
    tint: 'sand',
  },
  {
    label: 'Projects',
    eyebrow: 'Projects Folder',
    icon: Hammer,
    count: '16 files',
    note: '4 active projects',
    tint: 'blue',
  },
  {
    label: 'Minutes of Meetings',
    eyebrow: 'Minutes of Meetings Folder',
    icon: NotebookTabs,
    count: '24 files',
    note: 'Last added yesterday',
    tint: 'lilac',
  },
  {
    label: 'Correspondences',
    eyebrow: 'Correspondences Folder',
    icon: Mail,
    count: '31 files',
    note: '5 unread updates',
    tint: 'peach',
  },
  {
    label: 'General',
    eyebrow: 'General Library',
    icon: Library,
    count: '7 files',
    note: 'Shared with your team',
    tint: 'mint',
  },
] as const;

const recentFiles = [
  { name: 'Operating licence.pdf', meta: 'PDF · 2.1 MB', tag: 'Compliance' },
  { name: 'Station renewal notes.docx', meta: 'DOCX · 840 KB', tag: 'Projects' },
];

export function ReadableTiles() {
  const [activeArea, setActiveArea] = useState<string>(areas[0].label);
  const [query, setQuery] = useState('');
  const [uploadReady, setUploadReady] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const [browseMessage, setBrowseMessage] = useState(false);

  const visibleAreas = areas.filter((area) =>
    area.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const active = areas.find((area) => area.label === activeArea) ?? areas[0];
  const ActiveIcon = active.icon;

  return (
    <main className="my-documents-preview readable-tiles">
      <header className="readable-header">
        <div className="readable-header-top">
          <div className="app-kicker">Petrotrack · Shared workspace</div>
          <button
            className="header-icon-button"
            type="button"
            aria-label="Document alerts"
            aria-expanded={showAlerts}
            onClick={() => setShowAlerts((current) => !current)}
          >
            <Bell size={17} strokeWidth={1.8} />
            <span className="notification-dot" />
          </button>
        </div>
        <div className="readable-title-row">
          <div>
            <p className="readable-overline">Workspace library</p>
            <h1 className="app-title">My Documents</h1>
          </div>
          <div className="document-total">
            <strong>98</strong>
            <span>total files</span>
          </div>
        </div>
      </header>

      <section className="readable-content">
        {showAlerts && (
          <div className="notification-callout" role="status">
            <Bell size={15} />
            <span><strong>1 review reminder</strong> · Safety certificate expires in 18 days.</span>
          </div>
        )}

        <div className="readable-intro">
          <div>
            <p className="readable-overline">Find it fast</p>
            <h2>What are you looking for?</h2>
          </div>
          <p className="readable-intro-copy">
            Choose an area to browse the files your station team shares.
          </p>
        </div>

        <label className="document-search">
          <Search size={17} aria-hidden="true" />
          <span className="sr-only">Search document areas</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search document areas"
            type="search"
          />
          {query && (
            <button
              className="search-clear"
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              Clear
            </button>
          )}
        </label>

        <div className="area-grid" aria-label="Document areas">
          {visibleAreas.map((area, index) => {
            const Icon = area.icon;
            const isActive = area.label === activeArea;
            return (
              <button
                className={`area-tile area-tile-${area.tint}${isActive ? ' is-active' : ''}`}
                key={area.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveArea(area.label)}
                style={{ '--tile-order': index } as CSSProperties}
              >
                <span className="tile-topline">
                  <span className="tile-icon"><Icon size={21} strokeWidth={1.8} /></span>
                  <span className="tile-state">{isActive ? 'Selected' : area.count}</span>
                </span>
                <span className="tile-label">{area.label}</span>
                <span className="tile-bottomline">
                  <span>{isActive ? area.count : area.note}</span>
                  <ArrowUpRight size={17} strokeWidth={2} />
                </span>
              </button>
            );
          })}
        </div>

        {visibleAreas.length === 0 && (
          <div className="area-empty">
            <Search size={19} />
            <strong>No document areas found</strong>
            <span>Try a shorter search, such as “legal” or “project”.</span>
          </div>
        )}

        <section className="active-area-card" aria-live="polite">
          <div className="active-area-heading">
            <div className="active-area-icon"><ActiveIcon size={20} strokeWidth={1.8} /></div>
            <div>
              <p className="readable-overline">Active area</p>
              <h2>{active.label}</h2>
            </div>
            <span className="active-check">Active</span>
          </div>
          <p className="active-area-note">
            {active.eyebrow} · {active.note.toLowerCase()}
          </p>
          <button className="browse-button" type="button" onClick={() => setBrowseMessage(true)}>
            {browseMessage ? `${active.label} selected` : `Browse ${active.label}`}
            <ChevronRight size={16} />
          </button>
          {browseMessage && (
            <p className="browse-status">Folder view is ready for your next action.</p>
          )}
        </section>

        <div className="recent-heading">
          <div>
            <p className="readable-overline">Quick access</p>
            <h2>Recently updated</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={() => setShowAllRecent((current) => !current)}
          >
            {showAllRecent ? 'Show less' : 'View all'} <ArrowUpRight size={14} />
          </button>
        </div>

        <div className="recent-files">
          {(showAllRecent
            ? [...recentFiles, { name: 'Supplier correspondence.pdf', meta: 'PDF · 1.2 MB', tag: 'Correspondences' }]
            : recentFiles
          ).map((file) => (
            <button
              className="recent-file"
              type="button"
              key={file.name}
              onClick={() => {
                setActiveArea(file.tag);
                setBrowseMessage(false);
              }}
            >
              <span className="file-icon"><FileText size={17} strokeWidth={1.8} /></span>
              <span className="file-copy">
                <strong>{file.name}</strong>
                <span>{file.meta} · {file.tag}</span>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>

        <button
          className={`upload-button${uploadReady ? ' is-ready' : ''}`}
          type="button"
          onClick={() => setUploadReady((current) => !current)}
        >
          <span className="upload-icon"><Upload size={17} /></span>
          <span>
            <strong>{uploadReady ? 'Upload area ready' : 'Upload file or certificate'}</strong>
            <small>{uploadReady ? `Add to ${active.label}` : 'Add something to the shared workspace'}</small>
          </span>
          <ChevronRight size={16} />
        </button>
      </section>
    </main>
  );
}
