import { create } from 'zustand';
export interface InputRequest { id: string; title: string; initial: string; resolve: (value: string | null) => void }
export const useInputDialog = create<{ request: InputRequest | null }>(() => ({ request: null }));
export function promptText(title: string, initial: string) {
  return new Promise<string | null>(resolve => {
    useInputDialog.getState().request?.resolve(null);
    useInputDialog.setState({ request: { id: crypto.randomUUID(), title, initial, resolve } });
  });
}
