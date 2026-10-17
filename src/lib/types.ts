export interface WorkspaceFile {
  id: string;
  path: string;
  content: string;
  savedContent: string;
  language: string;
}

export interface FileEntry { path: string; content: string }
export interface GitChange { path: string; index: string; working: string; originalPath?: string }
export interface GitStatus { branch: string; changes: GitChange[] }
export interface CommandResult { stdout: string; stderr: string; code: number }
export interface WorkspaceRoot { id: string; name: string; key: string; prefix: string; kind: 'local' | 'ssh' | 'wsl' | 'container'; target?: string; location: string }
export interface WorkspaceSnapshot { name: string; key: string; files: FileEntry[]; skipped: number; roots: WorkspaceRoot[]; activeRootId: string }
export interface TerminalSession { id: string; name: string; rootId: string; exited: boolean; exitCode: number | null; backlog: string }
export interface LanguageConfiguration { id: string; name?: string; languages: string[]; command?: string; args?: string[]; root?: string; tcp?: { host?: string; port: number }; builtin?: string; running?: boolean }
export interface LanguageSession { id: string; rootId: string; languages: string[]; capabilities: Record<string, unknown>; pathPrefix?: string }
export interface TaskConfiguration { label: string; type?: string; command?: string; args?: string[]; source?: string; dependsOn?: string | string[] }
export interface TaskRun { id: string; label: string; terminalId: string; status: 'running' | 'succeeded' | 'failed'; code?: number }
export interface DebugConfiguration { name: string; type: string; request?: string; program?: string; adapter?: { command?: string; args?: string[]; tcp?: { host?: string; port: number } } }
export interface EngineProfile { executable?: string; args?: string[]; engineRoot?: string; buildTool?: string; target?: string; platform?: string; configuration?: string; buildMethod?: string; exportPreset?: string; output?: string; actions?: Record<string, { command: string; args: string[] }> }
export interface EngineProject { id: string; kind: 'unreal' | 'unity' | 'godot' | 'custom'; name: string; file: string; folder: string; rootId: string; profile: EngineProfile }
export interface EngineInventory { rootId: string; projects: EngineProject[]; installations: { kind: string; name: string; executable: string }[]; externalEditor: { executable: string; flags: string } }
export interface ExternalOpenRequest { id: string; file: string; workspace?: string; line?: number; column?: number; replacesWorkspace?: boolean; error?: string }
export interface DebugFrame { id: number; name: string; line: number; column: number; source?: { path?: string; name?: string }; virtualPath?: string }
export interface DebugScope { name: string; variablesReference: number; expensive: boolean }
export interface DebugVariable { name: string; value: string; type?: string; variablesReference: number }
export interface ExtensionCommand { id: string; title: string; extensionId: string }
export interface ExtensionInfo {
  id: string; enabled: boolean; running: boolean;
  manifest: { displayName?: string; version: string; main?: string; contributes?: {
    commands?: { id: string; title: string }[];
    snippets?: { language: string; prefix: string; body: string; description?: string }[];
    themes?: { name: string; base: 'vs' | 'vs-dark' | 'hc-black'; inherit?: boolean; rules: { token: string; foreground?: string; fontStyle?: string }[]; colors: Record<string, string> }[];
  } };
}
export interface LspPosition { line: number; character: number }
export interface LspRange { start: LspPosition; end: LspPosition }
export interface LspDiagnostic { range: LspRange; message: string; severity?: number; source?: string; code?: string | number }
export type IdeEvent =
  | { type: 'external-open-request'; id: string }
  | { type: 'ai-event'; event: import('@opencode/client').OpenCodeEvent }
  | { type: 'terminal-data'; id: string; data: string }
  | { type: 'terminal-exit'; id: string; code: number }
  | { type: 'terminals'; sessions: TerminalSession[] }
  | ({ type: 'task' } & TaskRun)
  | { type: 'service-log'; service: string; text: string }
  | { type: 'extensions-changed' }
  | { type: 'extension-message'; text: string }
  | { type: 'language-started'; session: LanguageSession }
  | { type: 'language-stopped'; id: string }
  | { type: 'diagnostics'; sessionId: string; path: string; diagnostics: LspDiagnostic[] }
  | { type: 'debug-output'; text: string }
  | { type: 'debug-state'; state: 'starting' | 'running' | 'paused' | 'stopped'; reason?: string; threadId?: number; name?: string };

export interface DesktopAPI {
  externalPending(): Promise<ExternalOpenRequest[]>;
  externalAccept(id: string, replace: boolean): Promise<{ snapshot: WorkspaceSnapshot; path: string; line: number; column: number; replacesWorkspace: boolean }>;
  externalReject(id: string): Promise<void>;
  enginesList(): Promise<EngineInventory>;
  engineChoose(directory?: boolean): Promise<string | null>;
  engineSave(id: string, profile: EngineProfile, rootId: string): Promise<EngineInventory>;
  engineRun(id: string, action: string, rootId: string): Promise<{ id: string; name: string }>;
  aiRequest<T = unknown>(action: string, input?: Record<string, unknown>): Promise<T>;
  openFolder(): Promise<WorkspaceSnapshot | null>;
  refresh(): Promise<WorkspaceSnapshot>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string, expected: string): Promise<void>;
  saveAs(name: string, content: string): Promise<boolean>;
  renameFile(from: string, to: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  run(command: string): Promise<CommandResult>;
  gitStatus(): Promise<GitStatus>;
  gitAction(action: 'stage' | 'unstage' | 'commit' | 'diff', value: string): Promise<string>;
  cancelCommand(): Promise<void>;
  addFolder(): Promise<WorkspaceSnapshot | null>;
  workspaceRoots(): Promise<{ roots: WorkspaceRoot[]; activeRootId: string }>;
  selectRoot(id: string): Promise<{ roots: WorkspaceRoot[]; activeRootId: string }>;
  removeRoot(id: string): Promise<WorkspaceSnapshot>;
  saveWorkspace(): Promise<void>;
  loadWorkspace(): Promise<WorkspaceSnapshot | null>;
  connectRemote(spec: { kind: 'ssh' | 'wsl' | 'container'; target: string; path: string }, add: boolean): Promise<WorkspaceSnapshot>;
  fileUri(path: string): Promise<string>;
  virtualPath(uri: string, rootId?: string): Promise<string | null>;
  terminalList(): Promise<TerminalSession[]>;
  terminalCreate(options?: { cols?: number; rows?: number }): Promise<{ id: string; name: string }>;
  terminalWrite(id: string, data: string): Promise<void>;
  terminalResize(id: string, cols: number, rows: number): Promise<void>;
  terminalClose(id: string): Promise<void>;
  tasksList(): Promise<TaskConfiguration[]>;
  tasksRun(label: string, file?: string): Promise<{ label: string }>;
  tasksStop(id: string): Promise<void>;
  extensionsList(): Promise<ExtensionInfo[]>;
  extensionsInstall(folder: boolean): Promise<ExtensionInfo[]>;
  extensionsToggle(id: string, enabled: boolean): Promise<ExtensionInfo[]>;
  extensionsUninstall(id: string): Promise<ExtensionInfo[]>;
  extensionCommands(): Promise<ExtensionCommand[]>;
  extensionRun(id: string, command: string, context: { path: string; text: string; language: string }): Promise<{ text?: string; message?: string }>;
  languagesList(): Promise<LanguageConfiguration[]>;
  languagesRunning(): Promise<LanguageSession[]>;
  languageStart(id: string): Promise<LanguageSession>;
  languageStop(id: string): Promise<void>;
  languageDocument(id: string, document: { path: string; language: string; text: string }): Promise<string | undefined>;
  languageRequest<T = unknown>(id: string, method: string, params: unknown): Promise<T>;
  debugConfigurations(): Promise<DebugConfiguration[]>;
  debugStart(name: string, file?: string, breakpoints?: Record<string, number[]>): Promise<{ name: string }>;
  debugBreakpoints(file: string, lines: number[]): Promise<unknown>;
  debugRequest<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
  debugStop(): Promise<void>;
  onEvent(callback: (event: IdeEvent) => void): () => void;
}

declare global {
  interface Window {
    desktop?: DesktopAPI;
    showDirectoryPicker?: () => Promise<DirectoryHandle>;
    showSaveFilePicker?: (options: { suggestedName: string }) => Promise<WritableFileHandle>;
  }
}

export interface WritableFileHandle {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(content: string): Promise<void>; close(): Promise<void> }>;
}
export interface DirectoryHandle {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<DirectoryHandle | WritableFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<WritableFileHandle>;
  removeEntry(name: string): Promise<void>;
}
