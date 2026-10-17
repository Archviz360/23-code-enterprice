# 0.3.1 reliability audit

This audit fixes reproducible defects; it is **not a guarantee that software is 100% bug-free**. Tests validate specific behavior in this Windows environment, not every machine, model, account, or project.

## Corrections

- Repeated saves queue per buffer and use the preceding completed save's disk baseline. Native file mutations are serialized to prevent competing writes both accepting the same original content. Pending operations reject if their workspace changes.
- Workspace roots must be directories; Windows device filenames are rejected before filesystem access. Scanning skips files/directories that disappear, are locked, or become unreadable instead of failing the whole project.
- Recovery validates file/tab/root/settings shapes, deduplicates entries, clamps settings, and retains valid buffers from partially damaged records.
- All workspace Monaco models synchronize with buffers, including hidden files modified by language-server refactorings. Those edits now survive tab switching and recovery.
- Language servers advertising incremental synchronization receive a valid replacement range using UTF-16/CRLF coordinates. Explicitly disabled changes are respected; language changes reopen a document. Completion icons map LSP enums to Monaco's actual enum values. Duplicate language-server/debugger startup requests are guarded.
- Invalid protocol JSON primitives cannot crash the native process. Requests after server failure reject immediately. Native command output bounds include stderr and report overflow rather than silently treating truncated work as success.
- Malformed extension enable-state files no longer crash startup. Missing/corrupted preferences leave extensions disabled rather than silently reactivating them. Extension commands reject when their host exits or its IPC channel fails.
- AI sessions are reserved before asynchronous policy/model updates, preventing duplicate prompts. Snapshots account for queued/submitting work. The client reconnects after its own engine crashes without replaying prompts. OAuth completion keeps the original location context.
- AI UI submissions/forms are guarded against double submission and stale root responses. Stop remains available during another pending operation. Conditional form replies exclude inapplicable values, and unsupported external widgets explicitly require the native interface.
- AI shutdown occurs after windows accept closure. Cancelling an unsaved-file exit dialog no longer disables the still-open app's AI service.
- Terminal resize callbacks are cancelled on unmount and handle bridge failures. Small-window AI content can scroll rather than permanently hiding controls.
- The vulnerable build-tool proxy dependency chain is replaced with a scoped `global-agent` override. Both production and development dependency audits must be rerun for each release; advisories can change.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm audit
npm run test:e2e -- --grep-invert "Windows executable"
npm run package:win
npm run test:packaged
```

Regression coverage includes competing disk saves, Windows device names, invalid workspace roots, malformed/dead protocol peers, incremental LSP positions, AI prompt races, corrupted recovery fields, and hidden-file refactorings. Native AI tests use the actual bundled OpenCode engine and a local deterministic model fixture, exercise approvals and real disk writes, kill **only their test profile's engine** to verify reconnection/history, and cancel an actual unsaved-file quit to verify the app remains usable. Packaged checks repeat native features against the shipped application and launch the single-file portable executable.

The audit passed **72 unit tests**, **9 browser/desktop end-to-end tests**, **4 packaged-application checks**, TypeScript checking, lint, and the full dependency audit (zero reported vulnerabilities) on October 16, 2026. The packaged checks verified source/asset parity and exercised both the unpacked and single-file portable application. The AI fixture also verifies shell execution behind an approval and an interactive question/reply. Rerun packaged checks after rebuilding to verify the exact executables being distributed.

Tests use isolated temporary workspaces/profiles. They do not commit to the source repository, sign in to paid accounts, install remote targets, or download real models.

## Checks requiring user-provided environments

- Real Ollama inference quality, GPU/memory compatibility, and each downloaded model's tool-calling behavior.
- Actual OpenAI/other provider keys, OAuth accounts, subscription entitlements, rate limits, connectivity, and API charges.
- Live SSH, WSL, and Docker targets with the documented installed tools and authentication.
- Third-party extensions, arbitrary LSP/DAP adapters, compilers, and project task configurations.
- Windows publisher signing and SmartScreen reputation. Local executables remain unsigned without a publisher certificate.

Existing compatibility limits in [CUSTOM-IDE.md](CUSTOM-IDE.md) and [AI.md](AI.md) still apply. No audit can make an unavailable service or unsupported upstream capability work by assertion.
