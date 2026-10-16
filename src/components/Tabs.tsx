import { FileCode2, X } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { isDirty } from '../lib/files';

export function Tabs({ onClose }: { onClose: (id: string) => void }) {
  const { files, tabs, activeId, secondaryId, focusedGroup, openTab, toggleSplit, splitOpen } = useEditorStore();
  const selectedId = focusedGroup === 'secondary' ? secondaryId : activeId;
  return <div className="tabs" role="tablist" aria-label="Open files">
    {tabs.map(id => {
      const file = files.find(f => f.id === id);
      if (!file) return null;
      return <div className={`tab ${selectedId === id ? 'active' : ''}`} key={id}>
        <button role="tab" aria-selected={selectedId === id} onClick={() => openTab(id)} title={file.path}>
          <FileCode2 size={15} className="file-icon" />{file.path.split('/').pop()}
          {isDirty(file) && <span className="dirty" aria-label="Unsaved changes">●</span>}
        </button>
        <button className="tab-close" onClick={() => onClose(id)} aria-label={`Close ${file.path}`}><X size={14} /></button>
      </div>;
    })}<button className="split-button" onClick={toggleSplit} aria-label={splitOpen ? 'Close split editor' : 'Split editor'} title="Split Editor (Ctrl+\\)">◫</button>
  </div>;
}
