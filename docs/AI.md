# AI in 23 Code Enterprise 0.3

The Windows application bundles the **real OpenCode V2 2.0.31 engine**, not a chat-only imitation. Open **AI Assistant** in the activity bar (or `Ctrl+Alt+A`), open a local project, and select **Enable AI**. Trust is required before OpenCode loads project configuration. The engine starts on demand; no separate OpenCode, Node, or Bun installation is needed.

## Local Ollama

1. Install/start [Ollama](https://ollama.com/) and pull a model. Pick a model with tool calling for agentic coding; a text-only model can answer questions but cannot reliably edit or run tools.
2. Expand **Providers & local Ollama**. Leave `http://127.0.0.1:11434` or enter another loopback port, then **Connect Ollama**.
3. Refresh AI after background discovery completes, then choose an `ollama` model. No API key is required for an unauthenticated local server.

The URL picker intentionally accepts only loopback addresses. It checks the native `/api/tags` endpoint and configures OpenCode's OpenAI-compatible `/v1` endpoint. OpenCode discovers model capabilities and context limits. Models, GPU support, installation, and downloads are managed by Ollama, not this editor.

## OpenAI and other cloud providers

Select a provider under **Providers & local Ollama**, enter its API key, and select **Connect API key**. OpenAI also exposes the engine's **Sign in with ChatGPT** and legacy OAuth methods: start sign-in, open the returned page, complete the provider flow, then **Complete / check sign-in**. Available methods and models come from OpenCode rather than hard-coded model names. Provider access, subscriptions, model eligibility, regional restrictions, and API charges still apply. A ChatGPT subscription is not an OpenAI API credit balance.

API keys are handed to OpenCode's credential API in Electron's main process; they are not saved in browser local storage or workspace configuration. Credentials and OAuth tokens persist in the app's private OpenCode profile. **Do not assume they are OS-encrypted**; protect the Windows account and its application data. **Disconnect** removes a stored credential. Environment credentials cannot be disconnected in the UI; remove their environment variables and restart the application instead. Never paste secrets into chat.

For another OpenAI-compatible service, use a saved `opencode.jsonc` in the trusted project, for example:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "providers": {
    "my-server": {
      "name": "My compatible server",
      "package": "@opencode/ai/providers/openai-compatible",
      "settings": {
        "baseURL": "http://127.0.0.1:1234/v1"
        // If needed: "apiKey": "{env:MY_SERVER_API_KEY}"
      },
      "models": {
        "actual-model-id": {
          "capabilities": { "tools": true, "input": ["text"], "output": ["text"] },
          "limit": { "context": 32768, "output": 8192 }
        }
      }
    }
  }
}
```

Use accurate model IDs, limits, and tool capabilities from the server. Do not put real keys in committed files. Project configuration can also define OpenCode's agents, MCP servers, skills, and commands using V2 syntax.

## Agent workflows

- **Build** can inspect files, propose disk edits, and execute tools in a multi-step loop. The panel asks before edits, shell commands, external-directory access, code execution, and other non-read tools. Approval cards expose resources and tool details. **Allow once** or **Reject**; the panel never saves blanket approvals.
- **Plan** denies editing tools and shell commands. This is a tool policy, **not a security sandbox**.
- Save/discard dirty buffers before sending. OpenCode works on disk, not unsaved Monaco text. Existing save-conflict checks protect buffers if disk files change later.
- The conversation shows streamed response snapshots, collapsible reasoning/tool results, failures, cost, and pending questions. Use **Stop** to interrupt. Pending permissions/questions survive panel close/reopen.
- Review **Changed files** and their patches, then **Reload disk changes into editor**. Existing unsaved buffers are retained. Use Source Control to review or selectively revert changes; edits are not staged previews.
- Session history is local and folder-scoped. Reopen the panel, enable AI, and choose a previous session. Panel history is capped at the latest 200 messages and 100 session entries.
- The panel uses the primary Build/Plan agents and denies subagent delegation, since child agents have independent policies. Full OpenCode workflows and additional auth methods are available through **Native OpenCode terminal**.

## Native OpenCode

The terminal icon launches the bundled `opencode.exe` directly inside the editor's real PTY, at the active folder. It uses this app's isolated OpenCode profile, so connected providers are shared with the panel. The complete TUI supplies native `/connect`, `/models`, commands, MCP management, agents, and other OpenCode features. Its own sessions and permission policies apply independently of the panel policy. Only launch it for trusted projects.

The app stores this profile under its Electron `userData` directory in `ai/config`, `ai/data`, `ai/state`, and `ai/cache`. It does not replace the user's separately installed OpenCode configuration or service. The managed server binds to loopback with generated authentication; service credentials are never exposed to renderer JavaScript. It is stopped when the editor exits.

## Limits and verification

AI currently operates on **local roots only**; the local engine is not silently pointed at SSH/WSL/container paths. Each root has separate panel history. Stop a running panel agent before changing the active folder or replacing/removing roots.

The panel is a focused OpenCode API client, not a reproduction of every native TUI view. Provider-specific external/command auth methods and external form widgets use the native terminal. Plugins and MCP servers are trusted executable configuration and can have their own side effects. Shell commands run with your Windows user's full filesystem/network privileges. Carefully inspect all approvals. Inference uses the selected provider, but engine catalogs and configured integrations may make other network requests.

Automated tests use the **actual bundled engine** against a deterministic, loopback Ollama-compatible fixture to verify discovery, streaming, approvals/rejection, real file writes, cancellation, and session restoration without spending API credits. This does not prove a particular real Ollama model's quality or complete a real paid-provider/OAuth sign-in. Those require the user's running model or account. Generated Windows executables are unsigned.

References: [OpenCode V2 client](https://opencode.ai/v2/docs/build/client), [models](https://opencode.ai/v2/docs/models), [providers](https://opencode.ai/v2/docs/providers), [permissions](https://opencode.ai/v2/docs/permissions).
