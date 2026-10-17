# Game-engine connections (0.4)

Use the **Game Engines** activity-bar panel in the desktop app after opening a local project folder. Choose a detected project, select an **installed editor executable**, configure its options, and **Save engine connection**. Profiles are written to `.23code/engines.json` in the selected root; saving never launches code. Run buttons require a saved profile and saved workspace buffers, followed by a native approval showing the executable and arguments. Output/exit status appears in the integrated terminal. Kill/close that terminal to stop a process when needed.

No game engine, compiler toolchain, SDK, export template, license, engine plugin or asset importer is bundled/downloaded. Use trusted projects: engines and build scripts execute with your user permissions. Close running engine terminals before replacing a workspace, or add another root instead. Remote engine GUI launch is not implemented.

## Unreal Engine

- Detects `.uproject` files. Choose the matching `UnrealEditor.exe` (normally `UE_x.y/Engine/Binaries/Win64/UnrealEditor.exe`) and installation root `UE_x.y`. Standard Epic Games installations under Program Files are offered when found.
- **Open Unreal editor** launches that project. **Run game** adds `-game`.
- **Build C++ target** calls `Engine/Build/BatchFiles/Build.bat` with target (default `<ProjectName>Editor`), platform (default `Win64`), configuration (default `Development`) and project path. Override the target/tool for unusual projects or engine versions. Requires the engine-compatible Visual Studio C++ build tools, Windows SDK, and a native project target; Blueprint-only projects are not magically C++ projects.
- **Generate project files** and **Generate clangd database** invoke the installed Windows UnrealBuildTool executable. Tool locations/flags vary by engine distribution/version; provide a custom action if yours differs. The compilation database must be in a location clangd can find; add `--compile-commands-dir=...` to the generated language-server configuration when needed.
- **Configure engine language server** provides a clangd LSP configuration. Install clangd separately and generate an accurate compilation database (including Unreal include paths/defines). Full Unreal-aware IntelliSense, UHT reflection validation, Blueprint editing, visual debugging and live coding orchestration are not implemented.
- Unreal's own **Open IDE / open source** menu requires a compatible engine-side `ISourceCodeAccessor` plugin to invoke a custom editor. This release provides the receiving CLI and engine launch/build workflows, **not a prebuilt Unreal accessor plugin**. It is not a replacement for Unreal Editor.

## Unity

- Detects `ProjectSettings/ProjectVersion.txt`; selects the project directory rather than treating the version file as source. Standard Unity Hub installations under Program Files are offered.
- **Open Unity editor** uses `-projectPath` with the detected folder. Use a Unity version compatible with the project and an activated license.
- **Generate Unity build helper for review** creates an unsaved `Assets/Editor/Code23Build.cs` buffer. Review/save it, enable scenes in Unity Build Settings, install Windows build support, and then **Build Windows player** invokes Unity batch mode and the helper. Existing helper files are opened, never overwritten. A custom static editor method can replace the helper. Default output: `Builds/Windows64/Game.exe`.
- **Run EditMode tests** uses Unity's test command-line flags; install/configure the Unity Test Framework first. Unity can refuse batch commands while that project is open in another Unity process. Play mode remains controlled in Unity Editor.
- The C# language helper configures separately installed `csharp-ls`. Generate compatible `.sln`/`.csproj` files from Unity first. This is not an embedded Unity/Rider debugger or a claim of full Unity API/extension compatibility.

## Godot

- Detects `project.godot`. Choose the installed Godot executable. **Open Godot editor** uses `--path <folder> --editor`; **Run game** uses `--path <folder>`.
- **Export release** needs an existing export preset name and matching export templates. Output is project-relative (default `build/game.exe`); parent traversal/absolute output paths are rejected. Output directories are created only after launch approval.
- **Configure engine language server** supplies a local TCP GDScript server, default `127.0.0.1:6005`. Start Godot with the project open and enable its language server before starting the connection from **Language Servers**. Change the port to match Godot's settings if necessary.
- **Configure Godot TCP debugger** supplies DAP at `127.0.0.1:6006`, with the game debugger port default `6007`. Save `.23code/launch.json`, refresh **Run and Debug**, and select that configuration. Godot must have its DAP server enabled/running. Adapter capabilities and Godot versions vary. C# requires Godot's .NET edition and separate C# tooling.
- Generated server/debug profiles point at the nested detected project, not indiscriminately at the outer workspace. Existing configuration files are opened for manual merging rather than overwritten.

TCP LSP/DAP accepts only loopback hosts and integer ports `1–65535`, with a five-second connection timeout. It does not expose network listeners or automatically forward SSH/WSL/container ports.

## External-editor source requests

Choose the installed app executable in the engine's external-editor preferences. The panel shows its actual executable and this argument template:

```text
--workspace "{project}" --open-file "{file}" --line {line} --column {col}
```

Godot: **Editor Settings → Text Editor → External**, Exec Path and Exec Flags (enable external editor). Unity: **Preferences → External Tools**, External Script Editor and arguments; use Unity's placeholders such as `$(ProjectPath)`, `$(File)`, `$(Line)` and `$(Column)` rather than Godot's brace placeholders:

```text
--workspace "$(ProjectPath)" --open-file "$(File)" --line $(Line) --column $(Column)
```

An actual request opens the existing app instance, selects/opens the file and positions the cursor. Coordinates are one-based. File paths must be inside the workspace, and normal source-text size/path checks apply. An explicit workspace is recommended; without it, the receiver tries an already open root, then nearby engine/Git project markers. Opening a different workspace asks before discarding unsaved buffers. Existing-root requests retain unsaved buffers. The installed app is preferable for a stable engine integration path; portable launches use their original portable executable when available, not its temporary extraction path. The development Electron binary is not an external-editor installation.

## Other engines and custom commands

Defold `game.project` and GameMaker `.yyp` files are detected, and every root offers a **custom** profile. Configure installed tools for these or other engines (Bevy, Cocos, O3DE, CryEngine, custom C++/Rust engines, etc.) using the selected profile ID from the panel and explicit command/argument arrays:

```json
{
  "profiles": {
    "custom-<id shown in existing configuration>": {
      "actions": {
        "open": {"command":"installed-engine-editor","args":["${projectFolder}"]},
        "build": {"command":"cargo","args":["build"]},
        "run": {"command":"cargo","args":["run"]}
      }
    }
  }
}
```

Use the **actual generated profile ID**, not the example placeholder. Variables: `${workspaceFolder}`, `${projectFolder}`, `${projectFile}`, `${engineRoot}`. Commands run in the project directory with separate arguments, not as free-form shell strings. Custom actions can override Unreal/Unity/Godot defaults too. Engine prefix arguments are a JSON array; for Unreal they apply only to editor/game launches, not its separate build tools. Save/review the configuration and refresh before running it. No `devcontainer.json` or engine-specific plugin protocol is implied.

Discovery checks the selected root and up to three nested directory levels, bounded to approximately 1,000 visited directories. It skips engine/dependency/generated folders and does not recursively inspect a detected project's assets. Open the actual project root if discovery misses a deeply nested project. The editor excludes common Unreal/Unity/Godot generated caches and binary assets from its source snapshots. Source scans/search still have the normal 3,000-file/20-MiB limits; this is not unlimited indexing of an entire Unreal engine checkout.

## Verification and limits

Automated checks cover command construction for Unreal builds/project files/clangd databases, Unity builds/tests, Godot exports, custom commands, output-path rejection and loopback-only transport. Real socket fixtures verify Unicode framed LSP/DAP requests. Actual Windows UI tests detect representative projects, save a profile, approve and execute a real PTY fixture command with spaced paths, generate a Unity helper without overwriting files, and invoke a second Windows process to open a source file at the requested cursor position while preserving an unsaved buffer. Packaged tests repeat the native workflow.

**Real Unreal/Unity/Godot installations, license activation, game builds, gameplay and engine-specific completion/debugging have not been verified in this environment.** The deterministic fixtures verify the integration plumbing, not compatibility with every engine version or plugin. Provision the matching engines/toolchains and a representative project before claiming a production game workflow is validated.
