import { useLayoutEffect, useRef, useState } from 'react';
import { useInputDialog, type InputRequest } from '../store/inputDialogStore';
export function InputDialog() {
  const { request } = useInputDialog();
  return request ? <InputForm key={request.id} request={request} /> : null;
}
function InputForm({ request }: { request: InputRequest }) {
  const [value, setValue] = useState(request.initial);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => { input.current?.focus(); input.current?.select(); }, []);
  const finish = (result: string | null) => { request.resolve(result); useInputDialog.setState({ request: null }); };
  return <div className="modal-backdrop"><form className="input-dialog" role="dialog" aria-modal="true" aria-label={request.title} onSubmit={e => { e.preventDefault(); finish(value); }} onKeyDown={e => {
    if (e.key === 'Escape') { e.preventDefault(); finish(null); }
    if (e.key === 'Tab') {
      const elements = [...e.currentTarget.querySelectorAll<HTMLElement>('input, button:not(:disabled)')];
      const index = elements.indexOf(document.activeElement as HTMLElement);
      const next = (index + (e.shiftKey ? -1 : 1) + elements.length) % elements.length;
      e.preventDefault(); elements[next]?.focus();
    }
  }}><label>{request.title}<input ref={input} aria-label="File path" value={value} onChange={e => setValue(e.target.value)} /></label><div><button type="button" onClick={() => finish(null)}>Cancel</button><button type="submit" className="primary" disabled={!value.trim()}>OK</button></div></form></div>;
}
