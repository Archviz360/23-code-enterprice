import { useEffect } from 'react';
import { useIdeStore } from '../store/ideStore';
import { useEditorStore } from '../store/editorStore';
import { monaco } from './monaco';
import { applyDiagnostics, registerLanguageSession } from './languageBridge';

export function useIdeServices() {
  const sessions = useIdeStore(state => state.languages);
  const extensions = useIdeStore(state => state.extensions);
  const extensionsReady = useIdeStore(state => state.extensionsReady);
  const files = useEditorStore(state => state.files);
  useEffect(() => {
    const api = window.desktop;
    if (!api) return;
    const unsubscribe = api.onEvent(event => {
      useIdeStore.getState().handle(event);
      if (event.type === 'diagnostics') applyDiagnostics(event.sessionId, event.path, event.diagnostics);
      if (event.type === 'language-stopped') for (const model of monaco.editor.getModels()) monaco.editor.setModelMarkers(model, 'lsp:' + event.id, []);
    });
    void Promise.all([api.terminalList().then(useIdeStore.getState().setTerminals), api.languagesRunning().then(useIdeStore.getState().setLanguages), useIdeStore.getState().refreshExtensions()]).catch(error => useEditorStore.getState().setMessage(error.message));
    return unsubscribe;
  }, []);
  useEffect(() => {
    const providers = sessions.map(registerLanguageSession);
    return () => providers.forEach(provider => provider.dispose());
  }, [sessions]);
  useEffect(() => {
    if (!window.desktop || !sessions.length) return;
    const timer = setTimeout(() => {
      const roots = useEditorStore.getState().roots;
      for (const session of sessions) {
        const root = roots.find(root => root.id === session.rootId);
        if (!root) continue;
        for (const file of files.filter(file => session.languages.includes(file.language) && (root.prefix ? file.path.startsWith(root.prefix) : !roots.some(other => other.prefix && file.path.startsWith(other.prefix))))) {
          void window.desktop!.languageDocument(session.id, { path: file.path, language: file.language, text: file.content }).catch(error => useEditorStore.getState().setMessage(error.message));
        }
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [files, sessions]);
  useEffect(() => {
    const disposables: monaco.IDisposable[] = [];
    for (const extension of extensions.filter(extension => extension.enabled)) {
      for (const snippet of extension.manifest.contributes?.snippets ?? []) disposables.push(monaco.languages.registerCompletionItemProvider(snippet.language, {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          return { suggestions: [{ label: snippet.prefix, kind: monaco.languages.CompletionItemKind.Snippet, insertText: snippet.body, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            documentation: snippet.description, range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) }] };
        },
      }));
      for (const theme of extension.manifest.contributes?.themes ?? []) monaco.editor.defineTheme(`extension:${extension.id}:${theme.name}`, { ...theme, inherit: theme.inherit ?? true });
    }
    const theme = useEditorStore.getState().settings.theme;
    if (extensionsReady) {
      if (theme.startsWith('extension:') && !extensions.some(extension => extension.enabled && theme.startsWith(`extension:${extension.id}:`))) useEditorStore.getState().setSettings({ theme: 'vs-dark' });
      else monaco.editor.setTheme(theme);
    }
    return () => disposables.forEach(disposable => disposable.dispose());
  }, [extensions, extensionsReady]);
}
