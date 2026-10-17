import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { languageCatalog, languageName } from '../lib/languageCatalog';
import { languageFor } from '../lib/files';
import { syntaxDescription } from '../lib/syntaxLanguages';
import { useLanguageStore } from '../store/languageStore';
import { useEditorStore } from '../store/editorStore';

export function LanguagePicker({ fileId, close }: { fileId: string; close(): void }) {
  const file = useEditorStore(state => state.files.find(file => file.id === fileId));
  const languages = useLanguageStore();
  const [query, setQuery] = useState('');
  const [associate, setAssociate] = useState(false);
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [extensions, setExtensions] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const all = [...languages.custom, ...languageCatalog];
  const matches = all.filter(language => `${language.name} ${language.id} ${language.aliases?.join(' ')} ${language.extensions.join(' ')}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100);
  const extension = file?.path.match(/\.[^./]+$/)?.[0];
  function choose(id: string, finish = true) {
    if (!file) return;
    const store = useEditorStore.getState();
    if (associate && extension) {
      languages.associate(extension, id);
      for (const target of store.files.filter(target => target.path.toLowerCase().endsWith(extension.toLowerCase()))) store.setLanguage(target.id, id);
    } else store.setLanguage(fileId, id);
    if (finish) close();
  }
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <section className="palette language-picker" role="dialog" aria-modal="true" aria-label="Choose programming language" onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') close(); }}>
      <div className="sidebar-heading">PROGRAMMING LANGUAGE<button className="icon-button" aria-label="Close language picker" onClick={close}><X size={16} /></button></div>
      <div className="language-picker-controls"><input ref={input} aria-label="Search programming languages" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search modern, historical, or custom languages…" />
        <p>{all.length} catalog/custom modes · Current: {file ? languageName(file.language, languages.custom) : 'No file'}</p>
        <p className="muted">Any language can be edited as text. Highlighting availability is shown below; compilers, LSP servers and debuggers are separate tools.</p>
        {extension && <label><input type="checkbox" checked={associate} onChange={event => setAssociate(event.target.checked)} />Use this mode for {extension} files</label>}
        <button onClick={() => { if (file) choose(languageFor(file.path, file.content)); }}>Detect from filename / shebang</button>
      </div>
      <div className="palette-results" role="listbox" aria-label="Programming languages">{matches.map(language => <button key={language.id} role="option" aria-selected={file?.language === language.id} onClick={() => choose(language.id)}><span>{language.name}<small>{syntaxDescription(language.id)} · {language.extensions.slice(0, 7).join(', ') || 'No standard extension'}{language.historical ? ' · historical' : ''}</small></span></button>)}{!matches.length && <p>No match. Add a custom mode below.</p>}</div>
      <div className="language-picker-controls"><details><summary>Add any missing language or dialect</summary><form onSubmit={event => { event.preventDefault(); try { languages.add(id.trim(), name, extensions.split(/[ ,]+/).filter(Boolean)); choose(id.trim(), false); setQuery(name); setError(''); } catch (error) { setError((error as Error).message); } }}>
        <label>Language id<input aria-label="Custom language id" value={id} onChange={event => setId(event.target.value)} placeholder="my-language" required /></label><label>Display name<input aria-label="Custom language name" value={name} onChange={event => setName(event.target.value)} required /></label><label>Extensions<input aria-label="Custom language extensions" value={extensions} onChange={event => setExtensions(event.target.value)} placeholder=".example .dialect" /></label><button className="primary">Add and select language</button></form></details>
        <label className="grammar-import">Import a trusted TextMate JSON grammar for {file?.language}<input type="file" accept=".json,.tmLanguage.json" aria-label="Import language grammar" onChange={async event => {
          const upload = event.target.files?.[0]; event.target.value = '';
          if (!upload || !file) return;
          try { if (upload.size > 128 * 1024) throw new Error('Grammar limit: 128 KiB.'); languages.grammar(file.language, await upload.text()); setError(''); } catch (error) { setError((error as Error).message); }
        }} /></label>
        <button onClick={() => { useEditorStore.getState().setSidebar('languages'); close(); }}>Configure completion / language servers</button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    </section>
  </div>;
}
