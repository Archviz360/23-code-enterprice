# 23 Code Enterprise

A local-first, VS Code-style editor built with React, TypeScript, Monaco, and Electron. This replaces the halted web prototype with a working editor workbench. It is **not a complete VS Code clone** and does not claim VS Code extension compatibility.

## Windows application (.exe)

Windows x64 builds are generated in `release/`:

- `23-Code-Enterprise-Setup-0.2.0-x64.exe`: installer with Start menu and desktop shortcuts. Installs for the current user without administrator access.
- `23-Code-Enterprise-Portable-0.2.0-x64.exe`: double-click to run without installing. It extracts its bundled runtime to a temporary folder; preferences and recovery still use your Windows user profile.

Both include Electron and the editor. **Users do not need Node.js, npm, or a browser installed.** Git is optional and must be installed separately for Source Control. Intended for 64-bit Windows 10/11.

Build the executables from source on Windows:

```sh
npm ci
npm run package:win
npm run test:packaged
```

The first packaging run downloads Electron/Windows packaging tools and needs internet access. `npm run package:win:dir` builds only the unpacked application for testing. The whole `release/win-unpacked/` directory is needed to run that development artifact; use the portable `.exe` when sharing a single file.

These local builds are **unsigned**. Windows SmartScreen may warn about an unknown publisher. Do not disable Windows security; only run binaries you built or obtained from a trusted source. Public releases should be code-signed with the publisher's own certificate. Packaging does not add the unimplemented VS Code features listed below.

## Run from source

Requires **Node.js 22.12+ or 24+**, npm, and optionally Git installed on your PATH.

```sh
npm ci
npm run desktop
```

If your npm configuration blocks Electron's download/install script:

```sh
npm run desktop:setup
npm run desktop
```

For the browser version:

```sh
npm run dev
```

Open the localhost address printed by Vite. Folder read/write access works in Chromium-based browsers in a secure context (localhost or HTTPS). Other browsers can open individual files and export downloads. Browser mode cannot execute local processes or run Git.

For desktop development with hot reload: `npm run desktop:dev`.

## New in 0.2: the eight custom IDE systems

The custom React/Monaco engine is retained, as requested. These are working custom implementations, **not a claim of full VS Code compatibility**:

| System | Implementation |
| --- | --- |
| Extensions | Install trusted custom ZIP/compatible VSIX archives or folders; separate Node extension host; commands, snippets, editor themes, and language-server contributions. Packages must declare `engines.23code`. |
| Debugging | Bundled Node Inspector-to-DAP adapter for saved JavaScript; breakpoints, stepping, pause/continue, call stack, variables, watches, evaluation, and debug output. External stdio DAP adapters are configurable. |
| Interactive terminal | Real ConPTY/PTY and xterm.js, persistent shell state, interactive input, Ctrl+C, resizing, multiple sessions, and process termination. |
| Language servers | Real stdio LSP bridge; bundled Pyright for Python; configurable servers for C/C++, Rust, and other languages. Completion, hover, definitions, references, rename, diagnostics, formatting and text-edit code actions depend on server capabilities. |
| Split editors | Two side-by-side groups with independent selection and shared file buffers/undo models. |
| Multi-root workspaces | Add/select/remove folders; root-aware file operations; save/reopen local `.23-workspace` descriptors. |
| Build/test tasks | Saved JSONC task configurations, npm script discovery, ordered task dependencies, live terminal output, exit status and cancellation. |
| Remote workspaces | Explicit SSH/WSL/running-container connections; remote file read/write/rename/delete, shells, tasks, Git and configured remote stdio LSP/DAP tools. Requires installed transport tools, Python 3 and a POSIX shell on the target. |

**[Setup, configuration examples, extension API, and compatibility limits](docs/CUSTOM-IDE.md)**

## Editor foundation

- VS Code-style activity bar, collapsible folder tree, tabs, breadcrumbs, status bar, and resizable sidebar/panel.
- Real folder access in desktop and supported browsers; create files/nested paths, rename, delete, save, Save All, and export copies.
- Independent file buffers, undo/redo and editor view state, dirty indicators, and local session recovery. Closing a tab retains the buffer in the explorer.
- Locally bundled Monaco and language workers: no editor CDN dependency. Syntax highlighting, multiple cursors, folding, bracket matching, minimap, suggestions, go-to-definition, and language-dependent diagnostics/formatting.
- Working in-file find/replace, literal workspace search/replace, clickable results, command palette, quick file switching, and go-to-line.
- Persisted theme, font size, indentation, word wrap, minimap, line numbers, and optional folder-only auto save.
- Problems panel with clickable Monaco diagnostics.
- Desktop Git status, stage/unstage, commit staged changes, and textual diffs, using your installed Git. It never automatically stages or commits.
- Desktop interactive terminals: PowerShell on Windows, `/bin/sh` elsewhere; multiple sessions with explicit approval. The bounded command API is retained for automation.
- Sandboxed HTML preview with scripts disabled.
- Repaired experimental Yjs/WebRTC text collaboration. Start/join explicitly from Extensions & Collaboration. Peers need matching file paths. Rooms use a public signaling service and are not a production collaboration platform.

## Shortcuts

Use Cmd instead of Ctrl on macOS.

| Action | Shortcut |
| --- | --- |
| Command palette | Ctrl+Shift+P / F1 |
| Quick Open | Ctrl+P |
| New / Open / Save | Ctrl+N / O / S |
| Save As / Export copy | Ctrl+Shift+S |
| Close tab / Rename symbol | Ctrl+W / F2 |
| Split editor | Ctrl+\ |
| Find / Replace | Ctrl+F / H |
| Workspace search | Ctrl+Shift+F |
| Go to line | Ctrl+G |
| Format document | Shift+Alt+F |
| Toggle sidebar / panel | Ctrl+B / J |
| Terminal / Problems | Ctrl+` / Ctrl+Shift+M |
| Start/continue / Stop debugger | F5 / Shift+F5 |
| Breakpoint / Step over / Into / Out | F9 / F10 / F11 / Shift+F11 |
| Settings / Word wrap | Ctrl+, / Alt+Z |

## Data and safety

- **Recovery is not Save.** Buffers are recovered in local browser/Electron storage, not synced to another device. Storage limits produce a warning; keep disk backups. A restored folder must be reopened to grant filesystem access again.
- Refresh updates clean buffers and retains unsaved ones. Saving refuses to overwrite a file that changed on disk since it was loaded; export a copy and compare instead. File checks are best-effort, not transactional protection against concurrent external writes.
- Desktop restoration identifies folders by their absolute path. Browser restoration asks you to confirm the original folder because folder handles are not persisted.
- Folder loading is deliberately limited to **3,000 text files, 2 MiB per file, and 20 MiB per root**, with up to 20 roots. Binary files, symlinks, and common dependency/build directories are skipped. Only loaded files are searched. Text is read/written as UTF-8; legacy encodings are not detected.
- Desktop uses a sandboxed renderer, context isolation, a narrow IPC bridge, path checks, and no Node.js access in page content. Shell commands still have your OS account's permissions: run only trusted commands. Git hooks can execute code when you commit.
- Interactive terminals do not have the old command runner's 120-second timeout; `cd`, variables, and interactive programs persist until you terminate the shell. The separate `desktop.run` automation API remains non-interactive and bounded. Up to 12 terminal sessions are retained; close old task terminals when finished.
- Extensions, tasks, language servers, debug adapters, and debugged programs can execute code with your user permissions. A separate extension process is not a sandbox. Execution requires explicit trust/approval; configurations do not auto-run on folder open. Previously installed/enabled trusted extensions activate on application start.
- Auto save is off by default. Save As exports a copy and does not mark an original linked workspace file as saved.

## Verify

```sh
npm run typecheck
npm run lint
npm test
npx playwright install chromium
npm run test:e2e
npm audit
```

The end-to-end suite tests editing/search/recovery/split groups and launches the actual Electron app against isolated temporary folders/profiles. It verifies real Git, persistent PTY variables, task dependencies, extension-host commands, bundled Pyright diagnostics/hover, debugger breakpoints/stepping/variables, and multi-root save/reopen. `npm run test:packaged` repeats the native feature test against the packaged executable, plus portable-extractor and offline-editor checks. Tests require a graphical session and Git. Unit tests also exercise the Python remote filesystem protocol when Python is available. They never operate on the source repository's Git history. Live SSH/WSL/Docker connections require your own provisioned targets and are not automatically created by the test suite.

## Architecture

- `src/store/editorStore.ts`: workspace buffers, tabs, preferences, recovery, and saves.
- `src/lib/workspace.ts`: browser filesystem/export adapter and desktop bridge dispatch.
- `src/lib/monaco.ts`: bundled editor, language workers, and TypeScript configuration.
- `src/components/`: workbench panels and editor UI.
- `electron/main.cjs` / `electron/preload.cjs`: restricted native filesystem, Git, and shell operations.
- `electron/services/`: workspace transports, PTYs, tasks, extensions, LSP and DAP services.
- `electron/node-debug-adapter.cjs`: bundled JavaScript debugger using the actual Node Inspector protocol.
- `electron/services/remote-agent.py`: explicitly launched remote filesystem agent.
- `examples/hello-extension/`: working custom extension example.
- `tests/unit/` and `tests/e2e/`: regression and real runtime checks.

The original `23 code enterprice.py` Tkinter editor and `ComfyUI_Optimized.ipynb` are retained as legacy artifacts. They are not used by this application.

## Remaining work toward VS Code parity

The eight systems above now have custom implementations. Remaining gaps include the full `vscode` extension API, Microsoft Marketplace integration, arbitrary VSIX compatibility, automatic filesystem watching, VS Code settings/keybinding compatibility, Node source-map/TypeScript debugging, server-command code actions, automatic language-server downloads, and devcontainer.json image-building/orchestration. External runtimes, compilers and adapters still need to be installed; the app does not silently install tools or accept SSH host keys.

For complete upstream compatibility, Code OSS remains an alternative architecture. This project deliberately continues as an independent custom IDE, with its own API and explicit compatibility limits.
