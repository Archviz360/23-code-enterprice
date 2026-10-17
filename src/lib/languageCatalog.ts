import data from '../data/languages.json';
import { bundledLanguagesInfo } from 'shiki/langs';

export interface LanguageDefinition { id: string; name: string; type?: string; extensions: string[]; filenames?: string[]; aliases?: string[]; interpreters?: string[]; scope?: string; historical?: boolean }
const historic: LanguageDefinition[] = [
  { id: 'plankalkul', name: 'Plankalkül', extensions: ['.plankalkul', '.pkalk'], historical: true },
  { id: 'short-code', name: 'Short Code', extensions: ['.shortcode'], historical: true },
  { id: 'autocode', name: 'Autocode', extensions: ['.autocode'], historical: true },
  { id: 'flow-matic', name: 'FLOW-MATIC', extensions: ['.flowmatic'], historical: true },
  { id: 'ipl', name: 'Information Processing Language (IPL)', extensions: ['.ipl'], historical: true },
  { id: 'machine-code', name: 'Machine code (text representation)', extensions: ['.machinecode'], historical: true },
];
export const languageCatalog: LanguageDefinition[] = [...data.languages, ...historic.filter(entry => !data.languages.some(language => language.id === entry.id))].sort((a, b) => a.name.localeCompare(b.name));
export const languageIds = languageCatalog.map(language => language.id);
const normalized = (value: string) => value.toLowerCase().replace(/\+\+/g, 'pp').replace(/#/g, 'sharp').replace(/[^a-z0-9]/g, '');
const grammars = new Map<string, string>();
for (const grammar of bundledLanguagesInfo) for (const alias of [grammar.id, grammar.name, ...(grammar.aliases ?? [])]) if (alias) grammars.set(normalized(alias), grammar.id);
const grammarOverrides: Record<string, string> = { fortran: 'fortran-fixed-form', 'fortran-free-form': 'fortran-free-form', asm: 'asm', shell: 'shellscript', bat: 'bat', plaintext: '', 'objective-cpp': 'objective-cpp', 'godot-resource': 'gdresource', 'godot-shaders': 'gdshader' };
export function grammarFor(language: LanguageDefinition): string | undefined {
  if (language.id in grammarOverrides) return grammarOverrides[language.id] || undefined;
  return [language.id, language.name, ...(language.aliases ?? [])].map(value => grammars.get(normalized(value))).find(Boolean);
}
const preferred: Record<string, string> = { '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript', '.h': 'c', '.m': 'objective-c', '.pl': 'perl', '.v': 'verilog', '.fs': 'fsharp', '.f': 'fortran', '.for': 'fortran', '.f77': 'fortran', '.f90': 'fortran-free-form', '.f95': 'fortran-free-form', '.gd': 'gdscript', '.uproject': 'json', '.uplugin': 'json', '.yyp': 'json', '.unity': 'yaml', '.tscn': 'ini', '.tres': 'ini', '.godot': 'ini', '.ush': 'hlsl', '.usf': 'hlsl' };
const empty: LanguageDefinition[] = [];
const emptyAssociations: Record<string, string> = {};
let previousCustom: LanguageDefinition[] | undefined, previousAssociations: Record<string, string> | undefined;
let all: LanguageDefinition[] = [], extensions: string[] = [];
const filenames = new Map<string, string>(), extensionIds = new Map<string, string>();
export function detectLanguage(path: string, content = '', custom: LanguageDefinition[] = empty, associations: Record<string, string> = emptyAssociations): string {
  if (custom !== previousCustom || associations !== previousAssociations) {
    previousCustom = custom; previousAssociations = associations; all = [...custom, ...languageCatalog];
    filenames.clear(); extensionIds.clear();
    for (const language of all) {
      for (const name of language.filenames ?? []) if (!filenames.has(name.toLowerCase())) filenames.set(name.toLowerCase(), language.id);
      for (const extension of language.extensions) if (!extensionIds.has(extension.toLowerCase())) extensionIds.set(extension.toLowerCase(), language.id);
    }
    extensions = [...new Set([...Object.keys(associations), ...Object.keys(preferred), ...extensionIds.keys()])].sort((a, b) => b.length - a.length);
  }
  const name = path.replaceAll('\\', '/').split('/').pop()!;
  const file = filenames.get(name.toLowerCase());
  const extension = extensions.find(extension => name.toLowerCase().endsWith(extension.toLowerCase()));
  if (extension && associations[extension]) return associations[extension];
  if (file) return file;
  if (extension) return custom.find(language => language.extensions.some(value => value.toLowerCase() === extension.toLowerCase()))?.id ?? preferred[extension] ?? extensionIds.get(extension.toLowerCase()) ?? 'plaintext';
  const shebang = /^#!\s*(\S+)(.*)$/.exec(content.split(/\r?\n/, 1)[0]);
  const executable = shebang?.[1].split('/').pop();
  const interpreter = executable === 'env' ? shebang?.[2].trim().split(/\s+/).find(token => !token.startsWith('-') && !token.includes('=')) : executable;
  return all.find(language => interpreter && language.interpreters?.includes(interpreter))?.id ?? 'plaintext';
}
export function languageName(id: string, custom: LanguageDefinition[] = []) { return [...custom, ...languageCatalog].find(language => language.id === id)?.name ?? id; }
