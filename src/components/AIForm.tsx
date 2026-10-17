import { useId, useRef, useState } from 'react';
import type { FormInfo, FormAnswer } from '../lib/ai';

export function AIForm({ fields, title, submit, cancel, sensitive = false }: { fields: FormInfo['fields']; title: string; submit(answer: FormAnswer): Promise<void>; cancel?: () => void; sensitive?: boolean }) {
  const [answer, setAnswer] = useState<FormAnswer>(() => Object.fromEntries(fields.filter(field => 'default' in field && field.default !== undefined).map(field => [field.key, 'default' in field ? field.default! : ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const formId = useId();
  const applicable = fields.filter(field => field.type === 'external' || (field.when ?? []).every(condition => condition.op === 'eq' ? answer[condition.key] === condition.value : answer[condition.key] !== condition.value));
  return <form className="ai-card ai-form" onSubmit={async event => {
    event.preventDefault(); if (submitting.current || applicable.some(field => field.type === 'external')) return;
    submitting.current = true; setBusy(true); setError('');
    try { await submit(Object.fromEntries(Object.entries(answer).filter(([key]) => applicable.some(field => field.key === key)))); }
    catch (error) { setError((error as Error).message); }
    finally { submitting.current = false; setBusy(false); }
  }}>
    <strong>{title}</strong>
    {fields.filter(field => field.type === 'external' || (!field.hidden && (field.when ?? []).every(condition => condition.op === 'eq' ? answer[condition.key] === condition.value : answer[condition.key] !== condition.value))).map(field => <label key={field.key}>{field.title ?? field.key}{field.description && <small>{field.description}</small>}
      {field.type === 'external' ? <p>Complete this step in native OpenCode.</p>
        : field.type === 'boolean' ? <input type="checkbox" checked={Boolean(answer[field.key])} onChange={event => setAnswer({ ...answer, [field.key]: event.target.checked })} />
        : field.type === 'multiselect' ? <select multiple required={field.required} value={Array.isArray(answer[field.key]) ? answer[field.key] as string[] : []} onChange={event => setAnswer({ ...answer, [field.key]: Array.from(event.target.selectedOptions, option => option.value) })}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : field.type === 'string' && field.options && !field.custom ? <select required={field.required} value={String(answer[field.key] ?? '')} onChange={event => setAnswer({ ...answer, [field.key]: event.target.value })}><option value="">Choose…</option>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        : <><input type={field.type === 'string' ? sensitive ? 'password' : 'text' : 'number'} step={field.type === 'integer' ? 1 : 'any'} required={field.required}
          list={field.type === 'string' && field.options ? `${formId}-${field.key}` : undefined}
          min={field.type !== 'string' && typeof field.minimum === 'number' ? field.minimum : undefined}
          max={field.type !== 'string' && typeof field.maximum === 'number' ? field.maximum : undefined}
          minLength={field.type === 'string' ? field.minLength : undefined} maxLength={field.type === 'string' ? field.maxLength : undefined}
          value={String(answer[field.key] ?? '')} onChange={event => {
            const next = { ...answer };
            if (!event.target.value) delete next[field.key];
            else next[field.key] = field.type === 'string' ? event.target.value : Number(event.target.value);
            setAnswer(next);
          }} />{field.type === 'string' && field.options && <datalist id={`${formId}-${field.key}`}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</datalist>}</>}
    </label>)}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="ai-actions"><button className="primary" disabled={busy || applicable.some(field => field.type === 'external')}>Submit</button>{cancel && <button type="button" onClick={cancel}>Cancel</button>}</div>
  </form>;
}
