import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { languageCatalog, type LanguageDefinition } from '../lib/languageCatalog';

interface LanguagesState {
  custom: LanguageDefinition[]; associations: Record<string, string>; grammars: Record<string, string>;
  add(id: string, name: string, extensions: string[]): void;
  associate(extension: string, id: string): void;
  grammar(id: string, text: string): void;
}
export const useLanguageStore = create<LanguagesState>()(persist((set, get) => ({
  custom: [], associations: {}, grammars: {},
  grammar: (id, text) => {
    if (text.length > 128 * 1024) throw new Error('Use a self-contained TextMate JSON grammar up to 128 KiB.');
    const value = JSON.parse(text);
    if (!value || typeof value.scopeName !== 'string' || !Array.isArray(value.patterns)) throw new Error('A TextMate grammar needs scopeName and patterns. Executable JavaScript grammars are not accepted.');
    if (!(id in get().grammars) && Object.keys(get().grammars).length >= 20) throw new Error('Grammar limit reached (20).');
    set(state => ({ grammars: { ...state.grammars, [id]: text } }));
  },
  add: (id, name, extensions) => {
    if (!/^[a-z][a-z0-9-]{0,79}$/.test(id) || !name.trim() || name.length > 120) throw new Error('Use a language id beginning with a letter, containing lowercase letters, digits or hyphens, and a display name.');
    if ([...languageCatalog, ...get().custom].some(language => language.id === id)) throw new Error('That language id already exists.');
    if (extensions.some(extension => !/^\.[a-zA-Z0-9_.+-]+$/.test(extension))) throw new Error('Extensions must begin with a dot, for example .example.');
    if (get().custom.length >= 500) throw new Error('Custom language limit reached (500).');
    set(state => ({ custom: [...state.custom, { id, name: name.trim(), extensions: [...new Set(extensions.map(value => value.toLowerCase()))] }] }));
  },
  associate: (extension, id) => {
    if (!/^\.[a-zA-Z0-9_.+-]+$/.test(extension)) throw new Error('Enter an extension such as .f90 or .custom.');
    set(state => ({ associations: { ...state.associations, [extension.toLowerCase()]: id } }));
  },
}), { name: '23-code-languages-v1', merge: (value, current) => {
  const data = value as Partial<LanguagesState> | null;
  return { ...current, custom: Array.isArray(data?.custom) ? data.custom.filter(language => language && typeof language.id === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(language.id) && typeof language.name === 'string' && Array.isArray(language.extensions) && language.extensions.every(extension => typeof extension === 'string')).slice(0, 500) : [], associations: data?.associations && typeof data.associations === 'object' ? Object.fromEntries(Object.entries(data.associations).filter(([extension, id]) => extension.startsWith('.') && typeof id === 'string')) : {}, grammars: data?.grammars && typeof data.grammars === 'object' ? Object.fromEntries(Object.entries(data.grammars).filter(([, text]) => typeof text === 'string' && text.length <= 128 * 1024).slice(0, 20)) : {} };
} }));
