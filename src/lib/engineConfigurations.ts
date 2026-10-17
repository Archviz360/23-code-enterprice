import type { EngineProject } from './types';
export function engineLanguages(project: EngineProject) {
  const root = engineProjectFolder(project);
  if (project.kind === 'godot') return { servers: [{ id: 'godot-gdscript', name: 'Godot · running editor', root, languages: ['gdscript'], tcp: { host: '127.0.0.1', port: 6005 } }] };
  if (project.kind === 'unity') return { servers: [{ id: 'unity-csharp', name: 'Unity C# · install csharp-ls', root, languages: ['csharp'], command: 'csharp-ls', args: [] }] };
  return { servers: [{ id: 'engine-clangd', name: 'C/C++ · install clangd', root, languages: ['c', 'cpp'], command: 'clangd', args: ['--background-index'] }] };
}
function engineProjectFolder(project: EngineProject) {
  const directory = project.file.replace(/(?:ProjectSettings\/ProjectVersion\.txt|[^/]+)$/, '');
  return '${workspaceFolder}' + (directory ? '/' + directory.replace(/\/$/, '') : '');
}
export const godotDebug = (project: EngineProject) => ({ version: '0.2.0', configurations: [{ name: 'Godot · running editor DAP', type: 'dap', request: 'launch', project: engineProjectFolder(project), port: 6007, adapter: { tcp: { host: '127.0.0.1', port: 6006 } } }] });
export const unityBuildHelper = `// Generated for review. Save before using Build. Requires Unity's editor APIs.
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;

public static class Code23Build
{
    public static void BuildWindows64()
    {
        var scenes = EditorBuildSettings.scenes.Where(scene => scene.enabled).Select(scene => scene.path).ToArray();
        if (scenes.Length == 0) throw new System.Exception("Enable at least one scene in Unity Build Settings.");
        Directory.CreateDirectory("Builds/Windows64");
        var report = BuildPipeline.BuildPlayer(scenes, "Builds/Windows64/Game.exe", BuildTarget.StandaloneWindows64, BuildOptions.None);
        EditorApplication.Exit(report.summary.result == BuildResult.Succeeded ? 0 : 1);
    }
}
`;
