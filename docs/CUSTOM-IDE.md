# Custom IDE systems (0.2)

The Windows executable contains the native services and bundled Node runtime. You do not need Node/npm installed to edit, use terminals, debug JavaScript, or start bundled Pyright. Building/running your own projects may require their tools.

## 1. Extensions

Open **Extensions & Collaboration** in the activity bar. Choose **Install from folder** or install an archive containing `package.json` and the extension files. A compatible VSIX may place these under `extension/`. Arbitrary VS Code extensions are intentionally rejected: they depend on an API this custom editor does not implement.

Example manifest:

```json
{
  "id": "mycompany.example",
  "displayName": "Example",
  "version": "1.0.0",
  "engines": { "23code": "^0.2.0" },
  "main": "extension.cjs",
  "contributes": {
    "commands": [{ "id": "example.upper", "title": "Example: Uppercase Document" }],
    "snippets": [{ "language": "javascript", "prefix": "log23", "body": "console.log(${1:value});" }]
  }
}
```

```js
// extension.cjs
exports.activate = api => {
  api.commands.registerCommand('example.upper', context => ({
    text: context.text.toUpperCase(),
    message: `Updated ${context.path}`,
  }));
};
```

`context` contains the selected document's `path`, `text`, and Monaco `language` identifier. Returning `{ text }` replaces the document through the editor undo stack; the replacement is refused if the buffer changed while the command ran. Returning `{ message }` shows a notification. `api.window.showInformationMessage(text)` also shows a notification. Commands appear in the command palette. `registerCommand` returns a disposable. The sample in `examples/hello-extension/` is tested against the real extension host.

Declarative contributions:

- `snippets`: `{ language, prefix, body, description? }`; snippet placeholders use Monaco's snippet syntax.
- `themes`: `{ name, base, inherit, rules, colors }` using Monaco's theme format. These are editor themes, not arbitrary workbench CSS. Enabled themes appear in Settings.
- `languageServers`: entries in the language-server format below. They are offered in the Language Servers panel; installation does not start them automatically.

Executable extensions are **trusted native code**, not sandboxed code. They run in a separate Electron-as-Node process and may use Node modules and OS APIs. Installation/enabling requires approval. Enabled extensions are remembered and activate on subsequent application starts. Disable/uninstall kills their host. No Microsoft Marketplace endpoint or publisher identity verification is provided. Archive traversal/symlinks are rejected; installations are limited to 2,000 files / 50 MiB.

## 2. Debugging

Save a `.js`, `.cjs`, or `.mjs` file in an open workspace. Select its root in Explorer. Click the glyph gutter (or press **F9**) to add breakpoints. **F5** launches the built-in Node debugger; the Run & Debug panel provides controls, stack frames, expandable variables, watches, and evaluation.

- **F5**: start/continue
- **Shift+F5**: stop
- **F10 / F11 / Shift+F11**: step over / into / out
- Click a stack frame to inspect its scopes and jump to source.
- Evaluating expressions can execute code; only evaluate expressions you intend to run.

The bundled adapter uses the real Node Inspector protocol and DAP. It does not emulate execution. It does not implement source maps, TypeScript transpilation, child-process attachment, or interactive debuggee stdin.

Choose **Configure launch.json**, save `.23code/launch.json`, then refresh the panel. `.vscode/launch.json` is also read, but only the documented fields are supported:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "JavaScript entry point",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/main.js",
      "stopOnEntry": true,
      "args": [],
      "env": {}
    },
    {
      "name": "Python (install debugpy first)",
      "type": "dap",
      "request": "launch",
      "adapter": { "command": "python", "args": ["-m", "debugpy.adapter"] },
      "program": "${file}",
      "console": "internalConsole",
      "justMyCode": true
    }
  ]
}
```

On Windows, use your actual Python executable path or `"command": "py", "args": ["-3", "-m", "debugpy.adapter"]` if the Python launcher is installed. The adapter and runtime are not installed automatically. Custom DAP configurations can use `launch` or `attach`; adapter-specific arguments are forwarded. Reverse DAP requests such as `runInTerminal` are not supported, so choose the adapter's internal-console mode. On remote roots, configure an adapter installed on the target; the bundled Node adapter is local-only.

## 3. Interactive terminals

Press **Ctrl+`**, then **New Terminal**. Windows uses PowerShell on real ConPTY; POSIX environments use `/bin/sh`. Shell state persists: `cd`, variables, stdin prompts and long-running programs work. **Ctrl+C** goes to the shell. Add/select/kill sessions with the terminal toolbar. Resizing the panel resizes the PTY.

Terminals start in the selected root. They continue running when the panel is hidden. There is no 120-second interactive limit. Up to 12 sessions are retained, with a bounded scrollback; close old task sessions when finished. Replacing the workspace requires stopping live terminals/debugging first. The older `desktop.run` API is retained for bounded, non-interactive automation only.

## 4. Language servers

Open a folder, select its root, then open **Language Servers**. Start **Python · bundled Pyright** to obtain real Python diagnostics, completion, hover, navigation and refactoring. Interpreter/third-party package discovery depends on your Python installation and Pyright configuration; analysis itself uses the bundled server.

For external servers, save `.23code/languages.json` (or `.vscode/languages.json`):

```json
{
  "servers": [
    { "id": "clangd", "name": "C/C++", "languages": ["c", "cpp"], "command": "clangd", "args": [] },
    { "id": "rust", "name": "Rust", "languages": ["rust"], "command": "rust-analyzer", "args": [] },
    {
      "id": "custom-python",
      "name": "External Pyright",
      "languages": ["python"],
      "command": "pyright-langserver",
      "args": ["--stdio"],
      "settings": {},
      "initializationOptions": {}
    }
  ]
}
```

The configured executable must already be installed. On Windows use an executable path, or explicitly launch a script through its interpreter; `.cmd` launchers may require `cmd.exe /d /s /c`. Remote servers run inside the selected target, not on the Windows host. Servers always require explicit approval to start.

The bridge supports full-buffer document synchronization, diagnostics, completion/snippets, hover, definition/reference navigation, rename, document formatting and text-edit code actions. Providers are enabled according to the server's advertised capabilities. Refactorings only apply to loaded workspace buffers. File creation/rename operations in LSP workspace edits, server-command actions, semantic tokens, unsolicited `workspace/applyEdit`, and full dynamic capability registration are not implemented. This is a useful LSP client, not every optional capability of the LSP specification.

## 5. Split editors

Press **Ctrl+\** or click the split button beside the tabs. Focus either group, then choose a file from the shared tabs/Explorer/Quick Open. Each group retains its selection; two views of the same file share a Monaco model and undo history. Save, find, formatting, status information and commands follow the focused group. Close the second group without closing or deleting its file buffers.

## 6. Multi-root workspaces

Use **File → Add Folder to Workspace**, or **Add Folder** in Explorer. Select the active tool root with Explorer's dropdown. Git, terminals, configurations and tools use that selected root. Additional roots use internal `@root-id/` path prefixes to prevent identical filenames from colliding. Explorer displays their folder names instead of the internal IDs.

Use **Save Workspace As** to write a `.23-workspace` file, then **Open Workspace** to grant access to those folders again. Relative file buffers and root selections are recovered locally, but filesystem permission is not silently restored. The Remote panel also lists roots and can remove them without deleting disk files; dirty buffers remain available for export. Stop a root's terminals/debugger before removing it.

Saved descriptors currently support local folders. Remote targets must be reconnected explicitly. A `.23-workspace` file does not auto-run tasks, servers or debug adapters.

## 7. Build/test tasks

Open **Build & Tasks**. npm scripts in the selected root are listed automatically. Configure additional tasks through `.23code/tasks.json` or `.vscode/tasks.json`; JSON comments and trailing commas are allowed.

```json
{
  "version": "2.0.0",
  "tasks": [
    { "label": "Build", "type": "shell", "command": "npm run build" },
    { "label": "Test after build", "type": "shell", "command": "npm test", "dependsOn": ["Build"] },
    {
      "label": "Python tests",
      "type": "process",
      "command": "python",
      "args": ["-m", "pytest"],
      "options": { "cwd": "${workspaceFolder}", "env": { "MY_MODE": "test" } }
    }
  ]
}
```

Supported: `label`, `type` (`shell`/`process`), `command`, string `args`, `dependsOn` (string/array), and `options.cwd/env`. `${workspaceFolder}` and `${file}` expand in command/args/cwd. Dependencies run in order, cycles/missing tasks are rejected, and failure stops the chain. Tasks use separate PTY sessions; output is live and sessions remain inspectable after exit. Use the run list's stop button to terminate a task.

Problem-matcher parsing, background task readiness, VS Code variable providers/inputs, automatic tasks and full `tasks.json` compatibility are not implemented. Save buffers before running: tasks read disk files.

## 8. SSH, WSL and containers

Open **Remote Workspaces**, select the environment, enter the target and absolute POSIX project path, then connect. Optionally add the target as another workspace root. Connection starts the bundled filesystem agent with Python 3 **on the target**. No Python package installation is required there.

Requirements:

- **SSH:** installed OpenSSH client, SSH host/alias (`user@host` is accepted), working key/agent authentication, and an already verified `known_hosts` entry. Configure ports/jump hosts/keys in your SSH config. Password prompts and automatic host-key acceptance are deliberately disabled. Verify the host independently using your normal SSH client before connecting.
- **WSL:** Windows WSL and an existing running/launchable distribution, e.g. `Ubuntu`, with Python 3 and `/bin/sh` installed.
- **Container:** installed Docker CLI/daemon and an already running Linux container, e.g. `my-dev-container`, with Python 3 and `/bin/sh`. This attaches to existing containers; it does not build images or implement `devcontainer.json` orchestration.

After connecting, folder scanning, UTF-8 edits, conflict-checked saves, rename/delete, Git, terminals, tasks, and configured stdio language/debug servers use that environment. External servers/adapters must be installed **there**. Remote servers may read target files as your remote account; do not connect to untrusted projects or execute untrusted tooling.

Agent requests are framed JSON with bounded messages. The agent checks relative paths, rejects symlink traversal and `.git` file access, and limits loaded files like local workspaces. Disconnected targets report errors; there is no offline remote write queue. Reconnect instead of assuming a timed-out save succeeded. A network failure during a remote save is not a transaction guarantee.

## Verification and limits

`npm test` covers buffers, split state, saved-file conflicts, transport construction, path validation and the real Python filesystem agent when a Python interpreter is available. `npm run test:e2e` exercises actual Electron PTYs, task dependencies, a real extension process, bundled Pyright, Node debugging/stepping, multi-root descriptors and browser split groups. `npm run test:packaged` repeats native checks from the packaged app and runs the portable extractor. All fixtures/profiles are isolated temporary folders.

Live SSH/WSL/Docker connections require provisioned user targets and are not fabricated or auto-created in tests. Their filesystem agent and transport argument handling are regression-tested separately. Native services are desktop-only; browser mode retains editing, recovery and split views.
