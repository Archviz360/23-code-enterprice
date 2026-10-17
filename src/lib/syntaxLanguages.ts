import type * as Monaco from 'monaco-editor';
import { createHighlighterCore, type HighlighterCore, type LanguageRegistration } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, type BundledLanguage } from 'shiki/langs';
import { grammarFor, languageCatalog } from './languageCatalog';
import { useLanguageStore } from '../store/languageStore';

type Stack = ReturnType<ReturnType<HighlighterCore['getLanguage']>['tokenizeLine']>['ruleStack'];
class GrammarState implements Monaco.languages.IState {
  constructor(readonly stack: Stack | null = null) {}
  clone() { return new GrammarState(this.stack); }
  equals(other: Monaco.languages.IState) { return other instanceof GrammarState && (this.stack === other.stack || !!(this.stack && other.stack && this.stack.equals(other.stack))); }
}
let editor: typeof Monaco;
let highlighter: Promise<HighlighterCore> | undefined;
export const nativeSyntax = new Set<string>();
const loading = new Map<string, { source: string; job: Promise<void> }>();
const installed = new Map<string, { provider: Monaco.IDisposable; core?: HighlighterCore }>();
function tokenScope(scopes: string[]) {
  const text = scopes.join(' ');
  if (/invalid/.test(text)) return 'invalid';
  if (/comment/.test(text)) return 'comment';
  if (/string|constant.character/.test(text)) return 'string';
  if (/constant.numeric/.test(text)) return 'number';
  if (/keyword|storage.type|storage.modifier/.test(text)) return 'keyword';
  if (/entity.name.type|support.type|entity.name.class/.test(text)) return 'type';
  if (/entity.name.function|support.function/.test(text)) return 'function';
  if (/punctuation/.test(text)) return 'delimiter';
  if (/variable/.test(text)) return 'variable';
  return '';
}
export function registerLanguageMode(id: string) {
  if (!editor || editor.languages.getLanguages().some(language => language.id === id)) return;
  const definition = [...useLanguageStore.getState().custom, ...languageCatalog].find(language => language.id === id);
  editor.languages.register({ id, aliases: [definition?.name ?? id, ...(definition?.aliases ?? [])], extensions: definition?.extensions, filenames: definition?.filenames });
}
export function initializeSyntax(monaco: typeof Monaco) {
  editor = monaco;
  monaco.languages.getLanguages().forEach(language => nativeSyntax.add(language.id));
  for (const language of [...languageCatalog, ...useLanguageStore.getState().custom]) registerLanguageMode(language.id);
  monaco.editor.defineTheme('light', { base: 'vs', inherit: true, rules: [], colors: {} });
}
export function syntaxDescription(id: string) {
  if (useLanguageStore.getState().grammars[id]) return 'Custom TextMate grammar';
  if (nativeSyntax.has(id)) return 'Built-in highlighting';
  const definition = [...useLanguageStore.getState().custom, ...languageCatalog].find(language => language.id === id);
  return definition && grammarFor(definition) ? 'Bundled TextMate grammar' : 'Text editing · grammar can be imported';
}
export function loadLanguageSyntax(id: string): Promise<void> {
  registerLanguageMode(id);
  const state = useLanguageStore.getState();
  const custom = state.grammars[id];
  if (nativeSyntax.has(id) && !custom) return Promise.resolve();
  const definition = [...state.custom, ...languageCatalog].find(language => language.id === id);
  const grammar = definition && grammarFor(definition);
  if (!grammar && !custom) return Promise.resolve();
  const source = custom ?? grammar!;
  if (loading.get(id)?.source === source) return loading.get(id)!.job;
  const job = (async () => {
    highlighter ??= createHighlighterCore({ themes: [], langs: [], engine: createJavaScriptRegexEngine({ forgiving: true }) });
    // Separate custom registries let users replace an imported grammar without
    // stale TextMate scope caches or affecting any other language's provider.
    const core = custom ? await createHighlighterCore({ themes: [], langs: [{ ...JSON.parse(custom), name: id } as LanguageRegistration], engine: createJavaScriptRegexEngine({ forgiving: true }) }) : await highlighter;
    if (!custom) await core.loadLanguage(await bundledLanguages[grammar as BundledLanguage]());
    if (loading.get(id)?.source !== source) { if (custom) core.dispose(); return; }
    const language = core.getLanguage(custom ? id : grammar!);
    const previous = installed.get(id);
    previous?.provider.dispose(); previous?.core?.dispose();
    const provider = editor.languages.setTokensProvider(id, {
      getInitialState: () => new GrammarState(),
      tokenize(line, state: GrammarState) {
        if (line.length > 20000) return { tokens: [{ startIndex: 0, scopes: '' }], endState: state };
        try {
          const result = language.tokenizeLine(line, state.stack, 100);
          return { tokens: result.tokens.map(token => ({ startIndex: token.startIndex, scopes: tokenScope(token.scopes) })), endState: new GrammarState(result.ruleStack) };
        } catch { return { tokens: [{ startIndex: 0, scopes: '' }], endState: state }; }
      },
    });
    installed.set(id, { provider, core: custom ? core : undefined });
  })().catch(error => { if (loading.get(id)?.source === source) loading.delete(id); throw error; });
  loading.set(id, { source, job });
  return job;
}
