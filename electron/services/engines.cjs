const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { modify, applyEdits } = require('jsonc-parser');
const { validateRelative } = require('./workspaces.cjs');

const skipped = new Set(['.git', 'node_modules', 'Library', 'Temp', 'Logs', 'obj', '.vs', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', '.godot', 'build', 'dist']);
const exists = async file => { try { return (await fs.stat(file)).isFile(); } catch { return false; } };
const quote = value => "'" + value.replaceAll("'", "''") + "'";
function project(kind, relative, root) {
  const full = relative ? path.join(root.path, relative) : root.path;
  return { id: `${kind}-${crypto.createHash('sha256').update(relative).digest('hex').slice(0, 10)}`, kind, name: kind === 'godot' ? path.basename(path.dirname(full)) : relative ? path.basename(full, path.extname(full)) : root.name, file: relative, folder: relative ? path.dirname(full) : root.path, rootId: root.id };
}
function buildCommand(item, profile, action, platform = process.platform) {
  const projectFile = item.file ? path.join(profile.workspace, item.file) : item.folder;
  const engineRoot = profile.engineRoot || (item.kind === 'unreal' && profile.executable ? profile.executable.replace(/[\\/]Engine[\\/]Binaries[\\/].*$/i, '') : '');
  const expand = value => String(value).replaceAll('${workspaceFolder}', profile.workspace).replaceAll('${projectFolder}', item.folder).replaceAll('${projectFile}', projectFile).replaceAll('${engineRoot}', engineRoot);
  const custom = profile.actions?.[action];
  if (custom) {
    if (typeof custom.command !== 'string' || !Array.isArray(custom.args) || custom.args.some(arg => typeof arg !== 'string')) throw new Error('Custom engine actions need command and an args array.');
    return { command: expand(custom.command), args: custom.args.map(expand), cwd: item.folder };
  }
  if (profile.args && (!Array.isArray(profile.args) || profile.args.some(arg => typeof arg !== 'string'))) throw new Error('Engine args must be an array of strings.');
  const args = (item.kind === 'unreal' && !['open', 'run'].includes(action) ? [] : [...(profile.args ?? [])]).map(expand);
  let command = profile.executable;
  if (item.kind === 'unreal') {
    if (action === 'open' || action === 'run') args.push(projectFile, ...(action === 'run' ? ['-game'] : []));
    else {
      const target = profile.target || item.name + 'Editor';
      const targetPlatform = profile.platform || (platform === 'win32' ? 'Win64' : platform === 'darwin' ? 'Mac' : 'Linux');
      const configuration = profile.configuration || 'Development';
      if (action === 'build') {
        command = profile.buildTool || (engineRoot && path.join(engineRoot, 'Engine/Build/BatchFiles', platform === 'win32' ? 'Build.bat' : platform === 'darwin' ? 'Mac/Build.sh' : 'Linux/Build.sh'));
        args.push(target, targetPlatform, configuration, `-Project=${projectFile}`, '-WaitMutex', '-FromMsBuild');
      } else {
        if (!engineRoot) throw new Error('Configure the Unreal Engine installation root first.');
        command = path.join(engineRoot, 'Engine/Binaries/DotNET/UnrealBuildTool/UnrealBuildTool.exe');
        if (platform !== 'win32') throw new Error('For this platform configure a custom projectFiles/compilationDatabase action using the installed UnrealBuildTool runtime.');
        if (action === 'projectFiles') args.push('-ProjectFiles', `-Project=${projectFile}`, '-Game', '-Engine');
        else if (action === 'compilationDatabase') args.push('-Mode=GenerateClangDatabase', target, targetPlatform, configuration, `-Project=${projectFile}`);
        else throw new Error('Unsupported Unreal action.');
      }
    }
  } else if (item.kind === 'unity') {
    args.push('-projectPath', item.folder);
    if (action === 'build') args.push('-batchmode', '-quit', '-executeMethod', profile.buildMethod || 'Code23Build.BuildWindows64', '-logFile', '-');
    else if (action === 'test') args.push('-batchmode', '-runTests', '-testPlatform', 'EditMode', '-testResults', path.join(item.folder, 'TestResults.xml'), '-logFile', '-');
    else if (action !== 'open') throw new Error('Unity Play mode is controlled inside the Unity Editor. Use Open editor.');
  } else if (item.kind === 'godot') {
    args.push('--path', item.folder);
    if (action === 'open') args.push('--editor');
    else if (action === 'export') {
      if (!profile.exportPreset) throw new Error('Set an existing Godot export preset name and install the matching export templates.');
      const output = profile.output || 'build/game.exe'; validateRelative(output.replaceAll('\\', '/'));
      args.push('--headless', '--export-release', profile.exportPreset, path.join(item.folder, output));
    } else if (action !== 'run') throw new Error('Unsupported Godot action.');
  } else throw new Error('Configure actions.open/build/run in .23code/engines.json for this engine.');
  if (!command) throw new Error('Choose the installed editor executable first. No engine is bundled or downloaded automatically.');
  return { command, args, cwd: item.folder };
}

class Engines {
  constructor(app, workspaces, terminals) { Object.assign(this, { app, workspaces, terminals }); }
  context() { const root = this.workspaces.active(); if (root.kind !== 'local') throw new Error('Game-engine launchers currently require a local workspace root.'); return root; }
  async installations() {
    const values = [];
    if (process.platform !== 'win32') return values;
    const programs = process.env.ProgramFiles || 'C:\\Program Files';
    for (const [kind, parent, tail] of [['unreal', path.join(programs, 'Epic Games'), 'Engine/Binaries/Win64/UnrealEditor.exe'], ['unity', path.join(programs, 'Unity/Hub/Editor'), 'Editor/Unity.exe']]) {
      const directories = await fs.readdir(parent, { withFileTypes: true }).catch(() => []);
      for (const directory of directories.filter(entry => entry.isDirectory()).slice(0, 50)) {
        const executable = path.join(parent, directory.name, tail);
        if (await exists(executable)) values.push({ kind, name: directory.name, executable });
      }
    }
    return values;
  }
  async list() {
    const root = this.context();
    const projects = [];
    let visited = 0;
    const walk = async (directory, relative = '', depth = 0) => {
      if (depth > 3 || visited > 1000) return;
      const entries = await fs.readdir(directory, { withFileTypes: true });
      const before = projects.length;
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const file = path.join(relative, entry.name);
        if (entry.isFile() && /\.uproject$/i.test(entry.name)) projects.push(project('unreal', file, root));
        if (entry.isFile() && entry.name === 'project.godot') projects.push(project('godot', file, root));
        if (entry.isFile() && (entry.name === 'game.project' || /\.yyp$/i.test(entry.name))) projects.push({ ...project('custom', file, root), name: `${entry.name === 'game.project' ? 'Defold' : 'GameMaker'} · ${path.basename(directory)}` });
        if (entry.isDirectory() && entry.name === 'ProjectSettings' && await exists(path.join(directory, entry.name, 'ProjectVersion.txt'))) projects.push({ ...project('unity', file + path.sep + 'ProjectVersion.txt', root), name: path.basename(directory), folder: directory });
      }
      if (projects.length > before) return;
      for (const entry of entries) if (entry.isDirectory() && !entry.isSymbolicLink() && !skipped.has(entry.name) && depth < 3) {
        if (++visited > 1000) break;
        await walk(path.join(directory, entry.name), path.join(relative, entry.name), depth + 1);
      }
    };
    await walk(root.path);
    projects.push(project('custom', '', root));
    const config = await this.workspaces.config('engines', { profiles: {} });
    if (!config.profiles || typeof config.profiles !== 'object' || Array.isArray(config.profiles)) throw new Error('engines.json needs a profiles object.');
    const installations = await this.installations();
    if (this.context().id !== root.id) throw new Error('Workspace changed while detecting engine projects. Refresh the panel.');
    return { rootId: root.id, projects: projects.map(item => {
      const profile = config.profiles[item.id] ?? {};
      if (!profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error(`Engine profile ${item.id} must be an object.`);
      return { ...item, file: item.file.replaceAll('\\', '/'), profile };
    }), installations, externalEditor: { executable: this.app.isPackaged ? process.env.PORTABLE_EXECUTABLE_FILE || process.execPath : '', flags: '--workspace "{project}" --open-file "{file}" --line {line} --column {col}' } };
  }
  async choose(directory = false) {
    const result = await this.workspaces.dialog.showOpenDialog(this.workspaces.getWindow(), { properties: [directory ? 'openDirectory' : 'openFile'] });
    return result.canceled ? null : result.filePaths[0];
  }
  async save(id, profile, rootId) {
    const root = this.context();
    if (rootId !== root.id) throw new Error('Workspace changed. Refresh game-engine projects before saving.');
    const list = await this.list();
    if (!list.projects.some(item => item.id === id) || !profile || typeof profile !== 'object' || Array.isArray(profile)) throw new Error('Invalid engine profile.');
    for (const [key, value] of Object.entries(profile)) if (key !== 'actions' && key !== 'args' && (typeof value !== 'string' || value.length > 4096 || /[\x00-\x1f]/.test(value))) throw new Error('Engine profile fields must be short text values.');
    if (profile.args && (!Array.isArray(profile.args) || profile.args.length > 100 || profile.args.some(value => typeof value !== 'string' || value.length > 4096))) throw new Error('Engine args must be an array of strings.');
    const file = root.prefix + '.23code/engines.json';
    let previous;
    try { previous = await this.workspaces.read(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const text = applyEdits(previous ?? '{\n  "profiles": {}\n}\n', modify(previous ?? '{\n  "profiles": {}\n}\n', ['profiles', id], profile, { formattingOptions: { insertSpaces: true, tabSize: 2 } }));
    if (this.context().id !== root.id) throw new Error('Workspace changed while saving the profile.');
    await this.workspaces.write(file, text, previous ?? '\0');
    return this.list();
  }
  async run(id, action, rootId) {
    if (!['open', 'run', 'build', 'test', 'export', 'projectFiles', 'compilationDatabase'].includes(action)) throw new Error('Unknown engine action.');
    const root = this.context();
    if (rootId !== root.id) throw new Error('Workspace changed. Refresh game-engine projects before launching.');
    const item = (await this.list()).projects.find(item => item.id === id);
    if (!item) throw new Error('Project was not found. Refresh game-engine projects.');
    const profile = { ...item.profile, workspace: root.path };
    const spec = buildCommand(item, profile, action);
    if (path.isAbsolute(spec.command) && !await exists(spec.command)) throw new Error(`Tool not found: ${spec.command}. Choose an installed compatible engine/toolchain.`);
    if (item.kind === 'unity' && action === 'build' && !profile.buildMethod && !await exists(path.join(item.folder, 'Assets/Editor/Code23Build.cs'))) throw new Error('Generate and save the Unity build helper, or configure an existing static build method.');
    await this.workspaces.approve(`Game engine: ${action}?`, `Project: ${item.name}\nFolder: ${item.folder}\nExecutable: ${spec.command}\nArguments: ${JSON.stringify(spec.args)}\n\nThis launches trusted engine/project code with your user permissions. Save files first. Builds require installed SDKs, compilers, licenses, and any engine-specific prerequisites.`);
    if (this.context().id !== root.id) throw new Error('Workspace changed before engine launch.');
    if (item.kind === 'godot' && action === 'export' && !profile.actions?.export) await fs.mkdir(path.dirname(spec.args.at(-1)), { recursive: true });
    const batch = /\.(bat|cmd)$/i.test(spec.command) && process.platform === 'win32';
    const launch = batch ? { command: 'powershell.exe', args: ['-NoLogo', '-NoProfile', '-Command', "$ErrorActionPreference = 'Stop'; & " + [spec.command, ...spec.args].map(quote).join(' ') + '; exit $LASTEXITCODE'] } : { command: spec.command, args: spec.args };
    return this.terminals.create({ ...launch, cwd: spec.cwd, name: `${item.kind} · ${action} · ${item.name}` }, true, root);
  }
}
module.exports = { Engines, buildCommand };
