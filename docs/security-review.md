# Maple V1 Security Review

Reviewed on 2026-10-18 against `main` at `0b68475` (MPL-31 merged).

## Scope

- The Electron main process (`src/main`), the preload (`src/preload`), and the renderer (`src/renderer`).
- The hook script (`resources/maple-hook.mjs`) and the hooks file it is wired into.
- Runtime dependencies (`npm audit --omit=dev`), the Electron version, and Dependabot.

Out of scope: Claude Code itself, `gh`, `git`, and the Jira and GitHub services.

## Threat model

Maple runs Claude sessions with permissions skipped, holds a Jira API token, and renders text it does not control.

Untrusted input:

- Jira card summaries and descriptions.
- PR titles and bodies from GitHub.
- File contents and file names in a card's worktree, which an agent writes.
- Terminal output from Claude sessions.
- Lines on the hook socket.

What must hold:

- Untrusted text renders as text and never runs as script in the renderer.
- If the renderer is compromised anyway, the main process checks every IPC argument, never reads files outside a tab's
  worktree, and never returns the Jira token or the process environment.
- No untrusted text reaches a shell.
- Other users on the machine cannot talk to the hook socket.

A compromised renderer can always type into a Claude session, and that session runs with permissions skipped. So the
main defense is keeping script out of the renderer; the IPC checks limit what a compromise can reach beyond that.

## Findings

| ID  | Area        | Finding                                                                                                                                                                                                        | Severity | Status                 |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------- |
| F1  | Electron    | No `will-navigate` or `will-redirect` guard. A page the window navigates to, such as an HTML file dropped on it, loads with the preload and gets `window.maple`. Now only the app's own URL may load.          | High     | Fixed in this PR       |
| F2  | Electron    | `sandbox: false`, because the preload was built as ESM. The preload is now built as CommonJS and the sandbox is on.                                                                                            | Medium   | Fixed in this PR       |
| F3  | Electron    | Pass: `contextIsolation: true`, `nodeIntegration: false`, `webSecurity` on.                                                                                                                                    | -        | -                      |
| F4  | Electron    | The CSP allowed only `'self'`, but had no `worker-src`, `object-src`, `base-uri`, or `form-action`. Added them; still no remote origins.                                                                       | Low      | Fixed in this PR       |
| F5  | Electron    | Pass: the window open handler denies every new window. It now parses the URL and opens only `http:` and `https:` externally.                                                                                   | -        | -                      |
| F6  | Electron    | DevTools open in production builds from the View menu.                                                                                                                                                         | Low      | Fixed in this PR       |
| F7  | Electron    | `ELECTRON_RENDERER_URL` is honored in a packaged build, so a launch environment could load any page with the preload. Now ignored when packaged.                                                               | Low      | Fixed in this PR       |
| F8  | Electron    | The `RunAsNode` fuse must stay on, because the hook command runs `ELECTRON_RUN_AS_NODE=1 <maple>`.                                                                                                             | Low      | Accepted               |
| F9  | Electron    | No permission request handler, so the renderer gets Electron's default permission grants (notifications, clipboard, media).                                                                                    | Low      | New card               |
| F10 | Electron    | IPC handlers do not check which frame sent a message.                                                                                                                                                          | Low      | Accepted               |
| F11 | IPC         | Handlers trusted their argument types. A card key such as `../../myself?` reached the Jira URL path. Every handler with arguments now checks them with zod; card keys must match `^[A-Z][A-Z0-9]+-\d+$`.       | Medium   | Fixed in this PR       |
| F12 | IPC         | `repo:readFile` checked the path as text only, so a symlink in the worktree could read any file, and it read a file in full before checking its size. It now resolves symlinks and checks size before reading. | Medium   | Fixed in this PR       |
| F13 | IPC         | Pass: no IPC result contains the Jira token or the process environment. A test serializes the result of four Jira failures and looks for the token.                                                            | -        | -                      |
| F14 | IPC         | A compromised renderer can type any text into a Claude session, which runs with permissions skipped.                                                                                                           | Medium   | Accepted               |
| F15 | Repo        | Listing changes read every untracked file in full and followed symlinks, so a symlink to `/dev/zero` hung the main process. It now counts lines only for regular files up to 2 MB.                             | Medium   | Fixed in this PR       |
| F16 | Commands    | Pass: every `git`, `gh`, and `claude` call uses `execFile` or `node-pty` with an argument array. No branch name or card key reaches a shell.                                                                   | -        | -                      |
| F17 | Commands    | Pass: the hooks file command quotes the exec and script paths. A test runs the command through `sh` with a single quote in both paths.                                                                         | -        | -                      |
| F18 | Hook socket | The socket took its mode from the umask. It is now `0600`. It is created, then changed, so there is a short window at startup; the default location, `XDG_RUNTIME_DIR`, is private to the user anyway.         | Low      | Fixed in this PR       |
| F19 | Hook socket | Pass: events for unknown tab ids are dropped by the status engine.                                                                                                                                             | -        | -                      |
| F20 | Hook socket | A connection that never sent a newline grew its buffer without limit. Lines over 64 KB are now dropped.                                                                                                        | Low      | Fixed in this PR       |
| F21 | Rendering   | Pass: no `innerHTML` or `dangerouslySetInnerHTML` in `src/renderer`. A lint rule now rejects both.                                                                                                             | -        | -                      |
| F22 | Rendering   | Pass: card descriptions and PR sections render through `react-markdown` with no raw HTML and its default URL filter. Links open only through the window open handler.                                          | -        | -                      |
| F23 | Rendering   | The change hover wraps old text in a three-backtick fence. Old text that contains three backticks ends the fence early and its markdown, links included, renders in the hover.                                 | Low      | New card               |
| F24 | Logging     | Pass: logs drop fields named like `token`, `authorization`, `password`, `secret`, or `env`.                                                                                                                    | -        | -                      |
| F25 | Jira        | `JIRA_SITE` may be `http://`, which would send the token in plain text.                                                                                                                                        | Low      | Accepted               |
| F26 | Sessions    | Claude sessions inherit Maple's whole environment.                                                                                                                                                             | Low      | Accepted               |
| F27 | Deps        | `npm audit --omit=dev` reports two low findings: DOMPurify's `IN_PLACE` mode, through `monaco-editor`. Monaco does not use `IN_PLACE`. No high or critical findings.                                           | Low      | Accepted               |
| F28 | Deps        | Pass: Electron 44.9.0 is the latest stable release.                                                                                                                                                            | -        | -                      |
| F29 | Deps        | Dependabot version updates are on for npm and GitHub Actions. Dependabot alerts and security updates were off in the repo settings; both are now on.                                                           | Low      | Fixed in repo settings |

## Accepted risks

- Sessions run with `--dangerously-skip-permissions`: Taylor's decision; agents work in worktrees on Taylor's own repos.
- Any local process running as Taylor can send fake hook events to the socket: the impact is a wrong dot only.
- A card or file can make the planner print a `MAPLE-BATCH:` line: the impact is highlighted cards only; starting
  them still needs a click.
- F8, `RunAsNode` stays on: the hook needs it, and anyone who can launch Maple with an environment variable can already
  run code as Taylor.
- F10, no sender frame check: there is one window, no iframes or webviews, and navigation away from the app is blocked.
- F14, a compromised renderer can type into a session: typing into sessions is the product; F1, F2, F21, and F22 keep
  script out of the renderer.
- F25, `http://` Jira site: the site comes from Taylor's own credentials file.
- F26, inherited environment: the agents already run as Taylor with permissions skipped.
- F27, DOMPurify `IN_PLACE`: Monaco does not call that mode; Dependabot picks up the fixed release.
