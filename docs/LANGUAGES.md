# Programming languages (0.4)

## Change a file's language

Click its language name at the bottom right, or choose **Editor: Change Programming Language** in the command palette. Search by name, ID, alias or extension. Selecting a mode changes the editor mode, not the text or filename. Check **Use this mode for .extension files** to update matching loaded files and remember detection for future files.

The app ships **842 language/format modes**: 836 definitions from GitHub Linguist's pinned language database, plus six early-language/text-representation entries (Plankalkül, Short Code, Autocode, FLOW-MATIC, IPL and machine-code text). Linguist includes programming, markup, data and prose formats; this is not a claim of 842 compilers. Modern and historic entries include Fortran, COBOL, ALGOL, Common Lisp, assembly, C/C++, C#, Python, Rust, Go, Java and GDScript.

There is no finite authoritative list covering every language, dialect or unpublished language that has ever existed. **Add any missing language or dialect** supports additional persistent language IDs, display names and extensions (up to 500 custom modes). All supported UTF-8 text can be edited, even without a grammar/compiler. Binary executables, visual asset formats and obsolete text encodings are not automatically translated or emulated. Plankalkül and other early entries without a supplied grammar are honestly labeled text-editing modes.

## Levels of support

| Capability | Availability |
| --- | --- |
| Edit/save/undo/search | Any loaded UTF-8 text file, within normal workspace limits. |
| Detection | Catalog filenames/extensions, longest-extension matching, common ambiguity overrides, shebang interpreters, and user extension associations. Ambiguous suffixes can require manual selection. |
| Syntax highlighting | Existing Monaco modes plus matching grammars from Shiki 4.5.0's offline collection of 242 grammars. The picker labels built-in, bundled TextMate, custom TextMate, or text-only modes. No claim that every catalog entry has a grammar. |
| Custom syntax | Import a **trusted, self-contained TextMate JSON** grammar for the selected language. Up to 128 KiB each / 20 grammars, stored locally. No JavaScript grammar execution, automatic downloads or VSIX import. External grammar dependencies must already be available; unsupported regex/grammar constructs can fall back to text. |
| Completion, diagnostics, refactoring | Monaco's existing language tools, bundled Pyright, or an installed and configured language server. The language ID must match the server's configured `languages` list. |
| Build/run/debug | Installed compilers/interpreters/SDKs via tasks/terminal; configured DAP adapters for debugging. Old hardware/runtime dialects may need an external emulator or cross-compiler. |

Grammars load lazily from packaged local assets, using a JavaScript regex engine compatible with the existing content-security policy (no WebAssembly/eval exception). Very long lines skip TextMate tokenization. Only import trusted grammars: a time budget is not a hard sandbox for a pathological JavaScript regular expression. Editing remains available when grammar loading fails.

Custom modes, associations and imported grammars persist under `23-code-languages-v1` in local app/browser storage. File modes persist with workspace recovery. Keep grammars small because browser storage is finite. The text editor continues to use UTF-8; historic EBCDIC or other legacy encodings need external conversion first.

## Configure tools

**Language Servers → Configure language servers** opens `.23code/languages.json`. For example, an installed Fortran server:

```json
{"servers":[{"id":"fortls","languages":["fortran","fortran-free-form"],"command":"fortls","args":[]}]}
```

Save, refresh the language-server panel, and explicitly start the server. These IDs are catalog/editor modes; compatibility with any particular server/version still requires the appropriate external tool. `.23code/tasks.json` configures compiler commands and `.23code/launch.json` configures DAP debugging. The browser version cannot start local executables.

## Data and tests

`src/data/languages.json` records its pinned Linguist revision. `npm run languages:update` is an explicit maintenance/download command; builds and app startup do not contact GitHub for language data. Attribution: [Linguist MIT license](LINGUIST-LICENSE.txt), [Shiki MIT license](SHIKI-LICENSE.txt), [Shiki](https://github.com/shikijs/shiki) and its language-grammar sources/licenses.

Tests check unique IDs, valid grammar mappings, modern/historical/game filename detection, shebangs, custom associations, validation and offline Fortran/COBOL/GDScript tokenization. Browser UI tests exercise manual changes, extension associations, custom language/grammar import, highlighting and recovery. These do not prove every grammar or historical compiler dialect correct.
