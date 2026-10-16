import { useMemo, useState } from 'react';
import { CaseSensitive, ReplaceAll } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

export function Search({ reveal }: { reveal: (id: string, line: number, column: number) => void }) {
  const { files, updateContent } = useEditorStore();
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const results = useMemo(() => {
    if (!query) return [];
    const needle = matchCase ? query : query.toLowerCase();
    return files.flatMap(file => {
      const matches: { line: number; column: number; text: string }[] = [];
      file.content.split('\n').forEach((text, index) => {
        const haystack = matchCase ? text : text.toLowerCase();
        let position = haystack.indexOf(needle);
        while (position !== -1 && matches.length < 200) {
          matches.push({ line: index + 1, column: position + 1, text });
          position = haystack.indexOf(needle, position + needle.length);
        }
      });
      return matches.length ? [{ file, matches }] : [];
    });
  }, [files, query, matchCase]);
  const count = results.reduce((n, result) => n + result.matches.length, 0);
  function replaceAll() {
    if (!query || !count || !confirm(`Replace all occurrences in ${results.length} files? Changes are not saved to disk until you save.`)) return;
    for (const { file } of results) {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      updateContent(file.id, file.content.replace(new RegExp(escaped, matchCase ? 'g' : 'gi'), () => replacement));
    }
  }
  return <><div className="sidebar-heading">SEARCH</div><div className="search-fields">
    <div className="input-row"><input aria-label="Search workspace" placeholder="Search workspace" value={query} onChange={e => setQuery(e.target.value)} /><button className={`icon-button ${matchCase ? 'checked' : ''}`} aria-label="Match case" aria-pressed={matchCase} onClick={() => setMatchCase(!matchCase)}><CaseSensitive size={18} /></button></div>
    <div className="input-row"><input aria-label="Replace in workspace" placeholder="Replace" value={replacement} onChange={e => setReplacement(e.target.value)} /><button className="icon-button" title="Replace All" aria-label="Replace all" onClick={replaceAll} disabled={!count}><ReplaceAll size={18} /></button></div>
    <p className="muted">{query ? `${count} matches in ${results.length} files (up to 200 per file)` : 'Search text in loaded workspace files.'}</p>
  </div><div className="search-results">{results.map(({ file, matches }) => <div key={file.id}><div className="search-file">{file.path} <span>{matches.length}</span></div>{matches.map((match, i) => <button key={i} onClick={() => reveal(file.id, match.line, match.column)} title={match.text}><span className="muted">{match.line}</span> {match.text.trim().slice(0, 150)}</button>)}</div>)}</div></>;
}
