# Source Control verification · 0.3.2

Source Control uses the installed Git executable, not simulated repository state. Open a Git repository's root folder in the Windows desktop app, save your changes, and open **Source Control**. **Refresh Git** rereads disk state; **+** stages, **−** unstages, **±** shows diffs, and **Commit staged changes** commits only the index with the entered message.

## Corrections from the UI audit

1. Filenames containing brackets were interpreted as Git wildcard patterns, so selecting `notes[1].txt` could also stage `notes1.txt`. All application Git commands now use `--literal-pathspecs`.
2. A HEAD-to-working-tree diff could be empty while a staged change and its unstaged reversal both existed. The output now shows **STAGED CHANGES** and **UNSTAGED CHANGES** separately.
3. Unstaging a renamed file previously removed only the destination from the index, leaving the source deletion staged. Status parsing now retains the original name, and unstaging/diffing a rename includes both paths.

## Tests

`tests/e2e/source-control.spec.ts` drives the actual Electron Source Control buttons against temporary repositories. It checks branch/status display, literal paths, stage/unstage, rename unstaging, staged/unstaged diffs, deleted files, first commits, unstaging without an existing HEAD, commits containing only staged work, detached HEAD display, and independent multi-root repositories. It also checks that opening a nested folder shows an explicit repository-root requirement instead of silently committing its parent repository.

Fixtures use temporary profiles/repositories and local Git identity settings. They do not commit, push, or alter Git configuration in this source repository. `tests/unit/gitStatus.test.ts` covers null-delimited status parsing and original rename paths.

```sh
npx playwright test tests/e2e/source-control.spec.ts
npm run package:win
npm run test:packaged
```

The packaged suite repeats these UI checks against the shipped application and verifies that packaged source/assets match the current build.

On October 16, 2026, v0.3.2 passed **75 unit tests**, **11 browser/desktop end-to-end tests**, and **6 packaged-app checks**, including both Source Control UI cases against the actual Windows application. TypeScript, lint, and the full dependency audit also passed. Git used for these checks was `2.56.0.windows.1`.

## Scope

- Git must be installed separately. This is a desktop feature, not browser-side Git.
- Commits require Git `user.name` and `user.email` to be configured. The app reports Git's error rather than inventing an author identity.
- The selected workspace root determines the repository. Open the repository root itself.
- Git reads **saved disk files**, not unsaved editor buffers. Refresh after external changes.
- Commit hooks and signing follow Git configuration and may require additional tools or credentials.
- Clone, fetch, pull, push, branch management, and dedicated merge-conflict UI are not implemented in this panel. Use the integrated terminal for those commands.
- Untracked files have no tracked diff until staged. Remote Git connections still require live SSH/WSL/container targets to validate.
