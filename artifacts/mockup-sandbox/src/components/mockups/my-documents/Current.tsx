import './_group.css';
import { FolderOpen, Folder, Plus, Upload, ShieldCheck, Scale, Hammer, NotebookTabs, Mail, Library, FileText } from 'lucide-react';

const sections = [
  { label: 'Compliance Folder', icon: ShieldCheck },
  { label: 'Legal Documents Folder', icon: Scale },
  { label: 'Projects Folder', icon: Hammer },
  { label: 'Minutes of Meetings Folder', icon: NotebookTabs },
  { label: 'Correspondences Folder', icon: Mail },
  { label: 'General Library', icon: Library },
];

const folders = [
  { name: 'Main folder', files: 2, active: true },
  { name: 'Certificates', files: 4, active: false },
  { name: 'Renewals 2026', files: 1, active: false },
];

export function Current() {
  return (
    <main className="my-documents-preview">
      <header className="app-header">
        <div className="app-kicker">Petrotrack · Shared workspace</div>
        <h1 className="app-title">My Documents</h1>
      </header>

      <nav className="current-tabs" aria-label="Document sections">
        {sections.map(({ label, icon: Icon }) => (
          <button className={label === 'Compliance Folder' ? 'current-tab active' : 'current-tab'} key={label}>
            <Icon size={14} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="current-content">
        <div className="intro-card">
          <div className="intro-icon"><FolderOpen size={19} /></div>
          <div>
            <h2>Shared folders and files</h2>
            <p>Anyone authorized to view this folder can preview, download, print or share its files.</p>
          </div>
        </div>

        <div className="stats">
          <div><strong>3</strong><span>folders</span></div>
          <div><strong>7</strong><span>files</span></div>
          <div><strong>1</strong><span>due soon</span></div>
        </div>

        <div className="section-label">Browse folders</div>
        <div className="folder-row">
          {folders.map(folder => (
            <button className={folder.active ? 'folder-tile active' : 'folder-tile'} key={folder.name}>
              <Folder size={25} />
              <strong>{folder.name}</strong>
              <span>{folder.files} files</span>
            </button>
          ))}
        </div>

        <button className="upload"><Upload size={16} /> Upload file or certificate</button>
        <div className="section-label">Main folder · 2 files</div>
        <div className="file-row"><FileText size={18} /><div><strong>Operating licence.pdf</strong><span>PDF · 2.1 MB · Corporate Services</span></div></div>
        <div className="file-row"><FileText size={18} /><div><strong>Safety certificate.pdf</strong><span>PDF · 1.4 MB · Corporate Services</span></div></div>
      </section>
    </main>
  );
}
