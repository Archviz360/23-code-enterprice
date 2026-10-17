import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Send, Square, TerminalSquare } from 'lucide-react';
import { ai, type AICatalog, type AISnapshot, type SessionInfo, type SessionMessageInfo, type IntegrationAttempt, type FormAnswer } from '../lib/ai';
import { AIForm } from './AIForm';
import { useEditorStore } from '../store/editorStore';
import { useIdeStore } from '../store/ideStore';

function Message({ message }: { message: SessionMessageInfo }) {
  if (message.type === 'user') return <article className="ai-message user"><strong>You</strong><pre>{message.text}</pre></article>;
  if (message.type !== 'assistant') return null;
  return <article className="ai-message"><strong>{message.model.providerID}/{message.model.id}</strong>{message.content.map((part, index) => part.type === 'text' ? <pre key={index}>{part.text}</pre> : part.type === 'reasoning' ? <details key={index}><summary>Reasoning</summary><pre>{part.text}</pre></details> : <details className="ai-tool" key={index}><summary>{part.name} · {part.state.status}</summary><pre>{JSON.stringify(part.state, null, 2)}</pre></details>)}{message.error && <pre className="error">{JSON.stringify(message.error, null, 2)}</pre>}</article>;
}

export function AI() {
  const rootId = useEditorStore(state => state.activeRootId);
  const linked = useEditorStore(state => state.workspaceLinked);
  const [catalog, setCatalog] = useState<AICatalog | null>(null);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [sessionID, setSessionID] = useState('');
  const [snapshot, setSnapshot] = useState<AISnapshot | null>(null);
  const [mode, setMode] = useState('build');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [provider, setProvider] = useState('openai');
  const [key, setKey] = useState('');
  const [attempt, setAttempt] = useState<IntegrationAttempt | null>(null);
  const [code, setCode] = useState('');
  const [ollama, setOllama] = useState('http://127.0.0.1:11434');
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  const transcript = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const pending = useRef(0);
  const rootRef = useRef(rootId); rootRef.current = rootId;
  const refresh = useCallback(async () => {
    const root = rootRef.current;
    const [next, history] = await Promise.all([ai<AICatalog>('catalog'), ai<SessionInfo[]>('sessions')]);
    if (rootRef.current !== root) return;
    setCatalog(next); setSessions(history);
    setProvider(current => next.integrations.some(provider => provider.id === current) ? current : next.integrations[0]?.id ?? '');
    setModel(current => current && next.models.some(m => `${m.providerID}/${m.id}` === current) ? current : '');
  }, []);
  const load = useCallback(async () => {
    if (!sessionID) return;
    const current = generation.current;
    const next = await ai<AISnapshot>('snapshot', { sessionID });
    if (generation.current === current) setSnapshot(next);
  }, [sessionID]);
  async function perform(callback: () => Promise<unknown>, concurrent = false) {
    if (pending.current && !concurrent) return;
    const root = rootRef.current;
    pending.current++;
    setBusy(true); setError('');
    try { await callback(); } catch (error) { if (rootRef.current === root) setError((error as Error).message); } finally { pending.current--; setBusy(pending.current > 0); }
  }
  useEffect(() => {
    generation.current++;
    setCatalog(null); setSessions([]); setSessionID(''); setSnapshot(null); setModel(''); setError(''); setKey(''); setAttempt(null); setNotice('');
  }, [rootId]);
  useEffect(() => {
    generation.current++; setSnapshot(null); follow.current = true;
    if (!sessionID) return;
    let disposed = false, loading = false;
    const update = async () => { if (disposed || loading) return; loading = true; try { await load(); } catch (error) { if (!disposed) setError((error as Error).message); } finally { loading = false; } };
    void update();
    // Bounded reconciliation also recovers missed SSE events and permissions after reconnect.
    const timer = setInterval(() => void update(), 1200);
    const off = window.desktop?.onEvent(event => { if (event.type === 'ai-event' && 'sessionID' in event.event.data && event.event.data.sessionID === sessionID && !event.event.type.endsWith('.delta')) void update(); });
    return () => { disposed = true; clearInterval(timer); off?.(); };
  }, [sessionID, load]);
  useEffect(() => { if (follow.current) transcript.current?.scrollTo({ top: transcript.current.scrollHeight }); }, [snapshot?.messages]);
  async function create() {
    const root = rootRef.current;
    const session = await ai<SessionInfo>('create', { mode });
    if (rootRef.current !== root) return;
    setSessions(current => [session, ...current]); setSessionID(session.id);
  }
  async function send() {
    if (busy || running) return;
    if (!prompt.trim() || !model) return;
    const store = useEditorStore.getState();
    const root = rootRef.current;
    if (store.files.some(file => file.content !== file.savedContent)) throw new Error('Save or discard unsaved files before asking the agent to work. This prevents conflicts with disk edits.');
    const id = sessionID || (await ai<SessionInfo>('create', { mode })).id;
    if (rootRef.current !== root) return;
    setSessionID(id);
    const slash = model.indexOf('/');
    await ai('prompt', { sessionID: id, text: prompt, model: { providerID: model.slice(0, slash), id: model.slice(slash + 1), ...(variant ? { variant } : {}) } });
    if (rootRef.current === root) { setPrompt(''); await refresh(); }
  }
  async function native() {
    const terminal = await ai<{ id: string }>('terminal');
    useIdeStore.getState().setTerminals(await window.desktop!.terminalList());
    useIdeStore.getState().setActiveTerminal(terminal.id); useEditorStore.getState().setPanel('terminal');
  }
  const selectedProvider = catalog?.integrations.find(p => p.id === provider);
  const selectedModel = catalog?.models.find(m => `${m.providerID}/${m.id}` === model);
  const running = !!snapshot?.active;
  const formSubmit = async (action: string, input: Record<string, unknown>, answer: FormAnswer) => { await ai(action, { ...input, answer }); await refresh(); };
  return <div className="ai-view"><div className="sidebar-heading">AI · OPENCODE<button className="icon-button" disabled={busy || !catalog} aria-label="Refresh AI" onClick={() => void perform(refresh)}><RefreshCw size={15} /></button></div>
    {!window.desktop ? <p className="tool-view">AI requires the Windows desktop app.</p> : !linked ? <p className="tool-view">Open a local project folder to use AI.</p> : <>
      {!catalog ? <div className="tool-view"><p>Real OpenCode agents, local Ollama, and cloud providers.</p><p className="muted">Enable only for trusted projects. Cloud providers receive your prompts and requested code; usage may be billed.</p><button className="primary" disabled={busy} onClick={() => void perform(async () => { await refresh(); })}>Enable AI</button></div> : <>
        <div className="ai-controls"><select aria-label="AI session" value={sessionID} disabled={busy} onChange={event => setSessionID(event.target.value)}><option value="">New conversation</option>{sessions.map(s => <option key={s.id} value={s.id}>{s.title ?? 'Conversation'} · {s.metadata?.mode === 'plan' ? 'Plan' : 'Build'} · {new Date(s.time.created).toLocaleString()}</option>)}</select>
          <div className="ai-actions"><select aria-label="AI mode" value={sessionID ? String(snapshot?.session.metadata?.mode ?? mode) : mode} disabled={!!sessionID} onChange={event => setMode(event.target.value)}><option value="build">Build · approve changes</option><option value="plan">Plan · no edits or shell</option></select><button aria-label="New AI conversation" disabled={busy} onClick={() => void perform(create)}><Plus size={15} /></button><button title="Full native OpenCode terminal" aria-label="Native OpenCode terminal" disabled={busy} onClick={() => void perform(native)}><TerminalSquare size={15} /></button></div>
          <select aria-label="AI model" value={model} disabled={running} onChange={event => { setModel(event.target.value); setVariant(''); }}><option value="">Select a model…</option>{catalog.models.filter(m => m.enabled).map(m => <option key={`${m.providerID}/${m.id}`} value={`${m.providerID}/${m.id}`}>{m.providerID} / {m.name}{m.capabilities.tools ? '' : ' (no tools)'}</option>)}</select>
          {!!selectedModel?.variants.length && <select aria-label="AI reasoning variant" value={variant} onChange={event => setVariant(event.target.value)}><option value="">Default variant</option>{selectedModel.variants.map(v => <option key={v.id} value={v.id}>{v.id}</option>)}</select>}
          <details className="ai-connections"><summary>Providers & local Ollama · engine {catalog.version}</summary><p className="muted">Keys stay in this app’s OpenCode profile, not browser storage. They are not guaranteed OS-encrypted. Do not paste keys into chat.</p>
            <label>Local Ollama URL<input aria-label="Ollama URL" value={ollama} onChange={event => setOllama(event.target.value)} /></label><button disabled={busy} onClick={() => void perform(async () => { const names = await ai<string[]>('ollama', { url: ollama }); setNotice(`Connected to Ollama. ${names.length} installed models. Refresh AI after discovery completes.`); await refresh(); })}>Connect Ollama</button><p className="muted">Start Ollama and pull a tool-capable model first. No key is needed locally. Other OpenAI-compatible endpoints can be configured in opencode.jsonc.</p>
            <select aria-label="AI provider" value={provider} onChange={event => { setProvider(event.target.value); setKey(''); setAttempt(null); }}>{catalog.integrations.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {selectedProvider?.connections.map((connection, index) => <div className="ai-card" key={index}><small>{connection.type === 'credential' ? connection.label : connection.name} · {connection.status?.message ?? 'configured'}</small>{connection.type === 'credential' && <button onClick={() => void perform(async () => { await ai('disconnect', { credentialID: connection.id }); await refresh(); })}>Disconnect</button>}</div>)}
            {selectedProvider?.methods.map((method, index) => method.type === 'key' ? <div key={`${provider}-${index}`}><input type="password" autoComplete="off" aria-label="AI API key" placeholder="API key" value={key} onChange={event => setKey(event.target.value)} />{method.form ? <AIForm key={provider} fields={method.form} title={method.label ?? 'API key options'} sensitive submit={answer => formSubmit('key', { integrationID: provider, key }, answer).then(() => setKey(''))} /> : <button disabled={!key || busy} onClick={() => void perform(async () => { const value = key; setKey(''); await ai('key', { integrationID: provider, key: value }); await refresh(); setNotice('Provider connected. Select a model.'); })}>Connect API key</button>}</div> : method.type === 'oauth' ? method.form ? <AIForm key={`${provider}-${index}`} fields={method.form} title={method.label} submit={async answer => setAttempt(await ai<IntegrationAttempt>('oauth', { integrationID: provider, methodID: method.id, answer }))} /> : <button key={index} disabled={busy} onClick={() => void perform(async () => setAttempt(await ai<IntegrationAttempt>('oauth', { integrationID: provider, methodID: method.id })))}>{method.label}</button> : <p className="muted" key={index}>{method.type === 'env' ? `Environment: ${method.names.join(', ')}` : 'Additional connection methods are available in native OpenCode.'}</p>)}
            {attempt && <div className="ai-card"><pre>{attempt.instructions}</pre><button onClick={() => void perform(() => ai('oauth-open', { attemptID: attempt.attemptID }))}>Open sign-in page</button>{attempt.mode === 'code' && <input aria-label="OAuth code" value={code} onChange={event => setCode(event.target.value)} placeholder="Authorization code" />}<button onClick={() => void perform(async () => { if (attempt.mode === 'code') await ai('oauth-complete', { attemptID: attempt.attemptID, code }); else { const result = await ai<{ status: string; message?: string }>('oauth-status', { attemptID: attempt.attemptID }); if (result.status !== 'complete') throw new Error(result.message ?? `Sign-in ${result.status}. Finish in your browser, then check again.`); } setAttempt(null); setCode(''); await refresh(); setNotice('Signed in. Select a model.'); })}>Complete / check sign-in</button><button onClick={() => void perform(async () => { await ai('oauth-cancel', { attemptID: attempt.attemptID }); setAttempt(null); })}>Cancel sign-in</button></div>}
          </details>
        </div>
        <div className="ai-transcript" ref={transcript} aria-label="AI conversation" onScroll={event => { const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 70; }}>{!snapshot?.messages.length && <p className="muted">Ask a question, plan a change, or let Build inspect, edit, and test your project. Save files first. New conversations use the selected mode.</p>}{snapshot?.messages.map(message => <Message key={message.id} message={message} />)}{running && <p role="status">Agent working…</p>}</div>
        <div className="ai-approvals">{snapshot?.permissions.map(permission => <div className="ai-card approval" key={permission.id}><strong>Approval: {permission.action}</strong><pre>{permission.resources.join('\n')}</pre>{permission.message && <p>{permission.message}</p>}<details><summary>Details</summary><pre>{JSON.stringify(permission.metadata, null, 2)}</pre></details><div className="ai-actions"><button disabled={busy} onClick={() => void perform(async () => { await ai('permission', { sessionID, requestID: permission.id, reply: 'once' }); await load(); })}>Allow once</button><button disabled={busy} onClick={() => void perform(async () => { await ai('permission', { sessionID, requestID: permission.id, reply: 'reject' }); await load(); })}>Reject</button></div></div>)}
          {snapshot?.forms.map(form => <AIForm key={form.id} fields={form.fields} title={form.title} submit={async answer => { await ai('form', { sessionID, formID: form.id, answer }); await load(); }} cancel={() => void perform(async () => { await ai('form-cancel', { sessionID, formID: form.id }); await load(); })} />)}
        </div>
        {!!snapshot?.diffs.length && <details className="ai-diffs"><summary>Changed files ({snapshot.diffs.length}) · review before keeping</summary>{snapshot.diffs.map(diff => <details key={diff.file}><summary>{diff.file} +{diff.additions} −{diff.deletions}</summary><pre>{diff.patch}</pre></details>)}<button onClick={() => void perform(async () => { const next = await window.desktop!.refresh(); useEditorStore.getState().refreshFiles(next.files); setNotice('Reloaded disk changes; unsaved buffers were kept.'); })}>Reload disk changes into editor</button></details>}
        <form className="ai-composer" onSubmit={event => { event.preventDefault(); void perform(send); }}><textarea aria-label="AI prompt" placeholder="Ask OpenCode…" value={prompt} maxLength={200000} onChange={event => setPrompt(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void perform(send); } }} /><div className="ai-actions"><button type="submit" className="primary" disabled={busy || running || !prompt.trim() || !model}><Send size={14} /> Send</button><button type="button" disabled={!sessionID} onClick={() => void perform(async () => { await ai('stop', { sessionID }); await load(); }, true)}><Square size={14} /> Stop</button><small>{snapshot ? `$${snapshot.session.cost.toFixed(4)}` : 'Ctrl+Enter'}</small></div><small className="muted">Agent edits affect disk. Review approvals and changes. Tools run as your Windows user.</small></form>
      </>}
      {notice && <p className="ai-notice" role="status">{notice}</p>}{error && <p className="ai-notice error" role="alert">{error}</p>}
    </>}
  </div>;
}
