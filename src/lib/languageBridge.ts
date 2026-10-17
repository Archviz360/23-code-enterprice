import { monaco } from './monaco';
import { useEditorStore } from '../store/editorStore';
import type { LanguageSession, LspRange } from './types';

interface TextEdit { range: LspRange; newText: string }
interface Completion { label: string; kind?: number; detail?: string; documentation?: string | { value: string }; insertText?: string; insertTextFormat?: number; textEdit?: TextEdit & { insert?: LspRange; replace?: LspRange }; additionalTextEdits?: TextEdit[]; sortText?: string; filterText?: string }
interface Location { uri?: string; range?: LspRange; targetUri?: string; targetRange?: LspRange; targetSelectionRange?: LspRange }
interface WorkspaceEdit { changes?: Record<string, TextEdit[]>; documentChanges?: { textDocument: { uri: string }; edits: TextEdit[] }[] }
const range = (value: LspRange) => new monaco.Range(value.start.line + 1, value.start.character + 1, value.end.line + 1, value.end.character + 1);
const point = (value: monaco.Position) => ({ line: value.lineNumber - 1, character: value.column - 1 });
const virtual = (model: monaco.editor.ITextModel) => model.uri.path.replace(/^\/workspace\//, '');
const resource = (path: string) => monaco.Uri.from({ scheme: 'file', path: '/workspace/' + path });
// LSP and Monaco use different completion-kind enum orders.
const kinds = monaco.languages.CompletionItemKind;
const completionKinds = [kinds.Text, kinds.Method, kinds.Function, kinds.Constructor, kinds.Field, kinds.Variable, kinds.Class, kinds.Interface, kinds.Module, kinds.Property, kinds.Unit, kinds.Value, kinds.Enum, kinds.Keyword, kinds.Snippet, kinds.Color, kinds.File, kinds.Reference, kinds.Folder, kinds.EnumMember, kinds.Constant, kinds.Struct, kinds.Event, kinds.Operator, kinds.TypeParameter];

async function workspaceEdits(edit: WorkspaceEdit, session: LanguageSession): Promise<monaco.languages.WorkspaceEdit> {
  const edits: monaco.languages.IWorkspaceTextEdit[] = [];
  const changes = [...Object.entries(edit.changes ?? {}), ...(edit.documentChanges ?? []).map(change => [change.textDocument.uri, change.edits] as const)];
  for (const [uri, replacements] of changes) {
    const path = await window.desktop!.virtualPath(uri, session.rootId);
    if (!path || !useEditorStore.getState().files.some(file => file.path === path)) throw new Error('Language server requested edits outside loaded workspace files. Load those files before refactoring.');
    for (const replacement of replacements) edits.push({ resource: resource(path), versionId: undefined, textEdit: { range: range(replacement.range), text: replacement.newText } });
  }
  return { edits };
}

export function registerLanguageSession(session: LanguageSession) {
  const disposable: monaco.IDisposable[] = [];
  async function request<T>(method: string, value: unknown): Promise<T | null> {
    try { return await window.desktop!.languageRequest<T>(session.id, method, value); }
    catch (error) { if (!/not running|stopped|exited/i.test((error as Error).message)) useEditorStore.getState().setMessage((error as Error).message); return null; }
  }
  function matches(model: monaco.editor.ITextModel) {
    const roots = useEditorStore.getState().roots;
    const path = virtual(model);
    if (session.pathPrefix && !path.startsWith(session.pathPrefix)) return false;
    const root = roots.find(root => root.prefix && path.startsWith(root.prefix)) ?? roots.find(root => !root.prefix);
    return root?.id === session.rootId && session.languages.includes(model.getLanguageId());
  }
  async function params(model: monaco.editor.ITextModel, position?: monaco.Position) {
    const uri = await window.desktop!.languageDocument(session.id, { path: virtual(model), text: model.getValue(), language: model.getLanguageId() });
    return { textDocument: { uri }, ...(position ? { position: point(position) } : {}) };
  }
  async function locations(values: Location | Location[] | null) {
    const results: monaco.languages.Location[] = [];
    for (const value of !values ? [] : Array.isArray(values) ? values : [values]) {
      const uri = value.targetUri ?? value.uri;
      const target = value.targetSelectionRange ?? value.targetRange ?? value.range;
      if (!uri || !target) continue;
      const path = await window.desktop!.virtualPath(uri, session.rootId);
      if (path && useEditorStore.getState().files.some(file => file.path === path)) results.push({ uri: resource(path), range: range(target) });
    }
    return results;
  }
  for (const language of session.languages) {
    if (session.capabilities.completionProvider) disposable.push(monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters: ['.', ':', '(', '"', "'", '/'],
      async provideCompletionItems(model, position) {
        if (!matches(model)) return null;
        const response = await request<Completion[] | { items: Completion[] }>('textDocument/completion', await params(model, position));
        const items = Array.isArray(response) ? response : response?.items ?? [];
        const word = model.getWordUntilPosition(position);
        return { suggestions: items.map(item => ({
          label: item.label, kind: completionKinds[(item.kind ?? 1) - 1] ?? kinds.Text, detail: item.detail,
          documentation: typeof item.documentation === 'string' ? item.documentation : item.documentation ? { value: item.documentation.value } : undefined,
          insertText: item.textEdit?.newText ?? item.insertText ?? item.label,
          insertTextRules: item.insertTextFormat === 2 ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined,
          range: item.textEdit?.range ? range(item.textEdit.range) : item.textEdit?.replace ? range(item.textEdit.replace) : new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          additionalTextEdits: item.additionalTextEdits?.map(edit => ({ range: range(edit.range), text: edit.newText })),
          sortText: item.sortText, filterText: item.filterText,
        })) };
      },
    }));
    if (session.capabilities.hoverProvider) disposable.push(monaco.languages.registerHoverProvider(language, {
      async provideHover(model, position) {
        if (!matches(model)) return null;
        const response = await request<{ contents: string | { value: string; language?: string } | (string | { value: string; language?: string })[]; range?: LspRange }>('textDocument/hover', await params(model, position));
        if (!response) return null;
        const contents = Array.isArray(response.contents) ? response.contents : [response.contents];
        return { contents: contents.map(item => ({ value: typeof item === 'string' ? item : item.language ? `\`\`\`${item.language}\n${item.value}\n\`\`\`` : item.value, isTrusted: false })), range: response.range ? range(response.range) : undefined };
      },
    }));
    if (session.capabilities.definitionProvider) disposable.push(monaco.languages.registerDefinitionProvider(language, {
      async provideDefinition(model, position) {
        if (!matches(model)) return null;
        return locations(await request<Location | Location[]>('textDocument/definition', await params(model, position)));
      },
    }));
    if (session.capabilities.referencesProvider) disposable.push(monaco.languages.registerReferenceProvider(language, {
      async provideReferences(model, position, context) {
        if (!matches(model)) return null;
        return locations(await request<Location[]>('textDocument/references', { ...await params(model, position), context }));
      },
    }));
    if (session.capabilities.renameProvider) disposable.push(monaco.languages.registerRenameProvider(language, {
      async provideRenameEdits(model, position, newName) {
        if (!matches(model)) return null;
        const response = await request<WorkspaceEdit>('textDocument/rename', { ...await params(model, position), newName });
        return response ? workspaceEdits(response, session) : null;
      },
    }));
    if (session.capabilities.documentFormattingProvider) disposable.push(monaco.languages.registerDocumentFormattingEditProvider(language, {
      async provideDocumentFormattingEdits(model, options) {
        if (!matches(model)) return null;
        const response = await request<TextEdit[]>('textDocument/formatting', { ...await params(model), options });
        return response?.map(edit => ({ range: range(edit.range), text: edit.newText })) ?? [];
      },
    }));
    if (session.capabilities.codeActionProvider) disposable.push(monaco.languages.registerCodeActionProvider(language, {
      async provideCodeActions(model, selection, context) {
        if (!matches(model)) return { actions: [], dispose() {} };
        const response = await request<{ title: string; kind?: string; edit?: WorkspaceEdit }[]>('textDocument/codeAction', {
          ...await params(model), range: { start: { line: selection.startLineNumber - 1, character: selection.startColumn - 1 }, end: { line: selection.endLineNumber - 1, character: selection.endColumn - 1 } },
          context: { diagnostics: [], only: context.only ? [context.only] : undefined },
        });
        const actions = await Promise.all((response ?? []).filter(action => action.edit).map(async action => ({ title: action.title, kind: action.kind, edit: await workspaceEdits(action.edit!, session) })));
        return { actions, dispose() {} };
      },
    }));
  }
  return { dispose() { disposable.forEach(item => item.dispose()); } };
}

export function applyDiagnostics(sessionId: string, path: string, diagnostics: import('./types').LspDiagnostic[]) {
  const model = monaco.editor.getModel(resource(path));
  if (!model) return;
  monaco.editor.setModelMarkers(model, 'lsp:' + sessionId, diagnostics.map(diagnostic => ({
    ...range(diagnostic.range), message: diagnostic.message, source: diagnostic.source,
    severity: diagnostic.severity === 2 ? monaco.MarkerSeverity.Warning : diagnostic.severity === 3 ? monaco.MarkerSeverity.Info : diagnostic.severity === 4 ? monaco.MarkerSeverity.Hint : monaco.MarkerSeverity.Error,
    code: diagnostic.code === undefined ? undefined : String(diagnostic.code),
  })));
}
