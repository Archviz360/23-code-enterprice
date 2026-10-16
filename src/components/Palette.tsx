import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
export interface PaletteItem { id: string; label: string; detail?: string; shortcut?: string }
export function Palette({ items, mode, close, choose }: { items: PaletteItem[]; mode: 'commands' | 'files'; close: () => void; choose: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const matches = items.filter(item => `${item.label} ${item.detail ?? ''}`.toLowerCase().includes(query.toLowerCase().replace(/^>/, ''))).slice(0, 100);
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(); }}>
    <section className="palette" role="dialog" aria-modal="true" aria-label={mode === 'commands' ? 'Command palette' : 'Quick open'} onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') { e.preventDefault(); input.current?.focus(); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(n => Math.min(n + 1, matches.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(n => Math.max(0, n - 1)); }
      if (e.key === 'Enter' && matches[selected]) { e.preventDefault(); choose(matches[selected].id); }
    }}><div className="palette-input"><Search size={16} /><input ref={input} aria-label={mode === 'commands' ? 'Search commands' : 'Search files'} placeholder={mode === 'commands' ? 'Type a command…' : 'Search files by name…'} value={query} onChange={e => { setQuery(e.target.value); setSelected(0); }} /></div>
      <div className="palette-results" role="listbox" aria-label="Results">{matches.map((item, index) => <button key={item.id} role="option" aria-selected={index === selected} className={index === selected ? 'selected' : ''} onMouseEnter={() => setSelected(index)} onClick={() => choose(item.id)}><span>{item.label}<small>{item.detail}</small></span><kbd>{item.shortcut}</kbd></button>)}{!matches.length && <p>No results.</p>}</div>
      <footer>↑↓ navigate · Enter select · Esc close</footer>
    </section>
  </div>;
}
