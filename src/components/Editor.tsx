import { useEffect } from 'react';
import MonacoEditor from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEditorStore } from '../store/editorStore';
import { useCollaborationStore } from '../store/collaborationStore';
import { MonacoBinding } from 'y-monaco';
import { monaco } from '../lib/monaco';
import { useIdeStore } from '../store/ideStore';
import { loadLanguageSyntax, registerLanguageMode } from '../lib/syntaxLanguages';
import { useLanguageStore } from '../store/languageStore';

interface Props { onMount: (editor: editor.IStandaloneCodeEditor) => void; editorInstance: editor.IStandaloneCodeEditor | null; fileId?: string | null; onFocus?: () => void }
export function Editor({ onMount, editorInstance, fileId: selectedFileId, onFocus }: Props) {
  const { files, activeId, settings, updateContent } = useEditorStore();
  const { doc, provider, roomId } = useCollaborationStore();
  const file = files.find(f => f.id === (selectedFileId ?? activeId));
  const fileId = file?.id;
  const filePath = file?.path;
  const grammars = useLanguageStore(state => state.grammars);
  if (file) registerLanguageMode(file.language);
  useEffect(() => {
    if (file?.language) void loadLanguageSyntax(file.language).catch(error => useEditorStore.getState().setMessage(`Highlighting unavailable: ${error.message}. Text editing still works.`));
  }, [file?.language, grammars]);
  useEffect(() => {
    if (!doc || !provider || !editorInstance || !fileId || !filePath) return;
    const model = editorInstance.getModel();
    if (!model) return;
    const text = doc.getText(filePath);
    // A room shares file paths; only the host seeds an empty shared document.
    if (useCollaborationStore.getState().isHost && text.length === 0) text.insert(0, model.getValue());
    const binding = new MonacoBinding(text, model, new Set([editorInstance]), provider.awareness);
    return () => binding.destroy();
  }, [doc, provider, roomId, editorInstance, fileId, filePath]);

  const breakpoints = useIdeStore(state => state.breakpoints);
  const pausedLocation = useIdeStore(state => state.pausedLocation);
  useEffect(() => {
    if (!editorInstance || !filePath) return;
    const listener = editorInstance.onMouseDown(event => {
      if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position) useIdeStore.getState().toggleBreakpoint(filePath, event.target.position.lineNumber);
    });
    const focus = editorInstance.onDidFocusEditorText(() => onFocus?.());
    return () => { listener.dispose(); focus.dispose(); };
  }, [editorInstance, filePath, onFocus]);
  useEffect(() => {
    if (!editorInstance || !filePath) return;
    const decorations = editorInstance.createDecorationsCollection([
      ...(breakpoints[filePath] ?? []).map(line => ({ range: new monaco.Range(line, 1, line, 1), options: { isWholeLine: true, glyphMarginClassName: 'debug-breakpoint', glyphMarginHoverMessage: { value: 'Breakpoint (click to remove)' } } })),
      ...(pausedLocation?.path === filePath ? [{ range: new monaco.Range(pausedLocation.line, 1, pausedLocation.line, 1), options: { isWholeLine: true, className: 'debug-current-line', glyphMarginClassName: 'debug-current-arrow' } }] : []),
    ]);
    return () => decorations.clear();
  }, [editorInstance, filePath, breakpoints, pausedLocation]);

  return <MonacoEditor height="100%" path={monaco.Uri.from({ scheme: 'file', path: '/workspace/' + file?.path }).toString()} language={file?.language}
    value={file?.content ?? ''} theme={settings.theme} keepCurrentModel saveViewState
    onMount={onMount} onChange={value => { if (file) updateContent(file.id, value ?? ''); }}
    loading={<div className="empty-state">Loading local editor…</div>}
    options={{ fontSize: settings.fontSize, tabSize: settings.tabSize, wordWrap: settings.wordWrap,
      minimap: { enabled: settings.minimap }, lineNumbers: settings.lineNumbers ? 'on' : 'off',
      scrollBeyondLastLine: false, automaticLayout: true, padding: { top: 16 },
      fontFamily: 'Cascadia Code, Consolas, monospace', bracketPairColorization: { enabled: true },
      // Use the stable textarea input path across Electron, browsers, and assistive tooling.
      editContext: false,
      glyphMargin: true,
      smoothScrolling: true, readOnly: !file, renderWhitespace: 'selection', fixedOverflowWidgets: true,
    }} />;
}
