# Maple

Personal agentic IDE for running Jira cards with Claude. Built with Electron, React, and TypeScript.

## Requirements

- Node 24 (see `.nvmrc`)
- A C++ toolchain and Python, for building `node-pty`
- tmux, so Claude sessions keep running if Maple crashes

## Usage

```bash
make pre-pr  # install dependencies, then run format, lint, typecheck, and test-unit
make format  # check formatting (npm run format fixes it)
make lint
make typecheck
make audit  # fail on high or critical npm advisories
make package  # build Maple and package it into dist/linux-unpacked
make test-unit  # run the unit tests, except the socket tests
make test-socket  # run the tests that open Unix sockets, which sandboxed runs cannot do
make test-e2e  # build the app and run the Playwright smoke test (needs a display and tmux, so not in the sandbox)
make test-all  # run test-unit, test-socket, test-live, and test-e2e
make clean  # delete node_modules and build and test output
make run     # start the app in development mode (needs a display, so not in the sandbox)
make try  # start a separate Maple with its own tabs and sessions, safe to close next to your main one
make test-live  # check Maple's assumptions against the real claude, Jira, and GitHub
make install-apparmor  # install the AppArmor profile Maple needs, with sudo
make install  # build Maple, copy it to ~/.local/share/maple/app, and add it to the desktop launcher
```

Run `make install-apparmor` once before the first `make install`, and again whenever `resources/apparmor/maple` changes; `make install` tells you when it is missing or out of date. It needs sudo. The Claude sandbox and Electron's own sandbox need user namespaces, which Ubuntu allows only for programs with an AppArmor profile, so without it the installed Maple may not start and its Claude sessions cannot run commands.

The launcher starts Maple through your login shell, so Maple and its Claude sessions get the PATH from your shell config each launch.

Only one Maple runs per config dir: opening a second one, from the launcher or `make run`, focuses the open window. To test a card's branch next to your main Maple, run `make try` in its worktree. It copies your `config.json` into `.maple-try/` in the worktree and keeps that copy's tabs, sessions, and settings there, so closing it never touches your main Maple's sessions. Like `make run`, it needs a display, so it does not run in the sandbox.

It uses your real Jira projects, so give every made-up test card the `test-card` label and a `[TEST]` summary prefix.

## Tests

- **Unit** (`make test-unit`): Vitest tests next to the code in `src/`. They mock the outside world: recorded Jira and GitHub JSON in `test/fixtures/`, a fake `node-pty`, and git repos built in a temp dir. Fast and free; `make pre-pr` runs them.
- **Socket** (`make test-socket`): the few unit tests that open Unix sockets for Claude's hooks. They are kept apart because the Claude sandbox blocks sockets.
- **E2E** (`test/e2e/`, `make test-e2e`): builds Maple and drives the real Electron window with Playwright. Everything outside Maple is fake: a local Jira server serving the recorded JSON, a stub `claude` that echoes its arguments, and a temp config dir. They check that the main process, IPC, and renderer work together. They need a display and tmux.
- **Live** (`test/live/`, `make test-live`): call Maple's Jira, GitHub, preflight, and session code against the real Jira, `gh`, and `claude`, using your credentials. They check that the outside world still matches the fixtures and fakes the other tests rely on. They cost money and can break when real data changes.

CI runs unit, socket, and e2e on every PR. Live tests run only by hand. The Claude sandbox can run only `make pre-pr`.

## Config

Maple reads `config.json` from `MAPLE_CONFIG_DIR` (default `~/.config/maple`). `~` expands to your home directory.

```json
{
  "worktreesDir": "~/Documents/code/wts",
  "vaultDir": "~/Documents/obsidian-vault",
  "notifications": true,
  "backgroundWaitMinutes": 10,
  "eventKeepDays": 365,
  "eventMaxMegabytes": 200,
  "stateBackups": 3,
  "startAtOnce": 4,
  "startGapSeconds": 90,
  "maxWorking": 8,
  "maxLoadPerCore": 0.8,
  "minFreeMegabytes": 2048,
  "projects": [
    {
      "name": "Maple",
      "jiraKey": "MPL",
      "jiraBoardId": 1,
      "plannerDir": "~/Documents/code/maple",
      "repo": "tahardi/maple"
    }
  ]
}
```

`eventKeepDays` and `eventMaxMegabytes` limit how much event history Maple keeps. On startup Maple deletes older days past these limits, and asks first if today's log would be deleted.

`startAtOnce`, `startGapSeconds`, `maxWorking`, `maxLoadPerCore`, and `minFreeMegabytes` limit how many cards Maple runs. Every Start joins one start queue shared by all projects. Maple starts the next queued card only while fewer than `maxWorking` tabs are working, the 1-minute load average is under `maxLoadPerCore` times the number of CPU cores, and at least `minFreeMegabytes` of memory is free. While fewer than `startAtOnce` tabs are working, Maple starts queued cards right away. From `startAtOnce` up to `maxWorking`, it starts one more card at most once every `startGapSeconds` seconds (default 90), so each new session's load shows up before the next start. Maple still re-checks CPU and memory every 15 seconds. The Home tab's planner lists the waiting cards, and the queue is saved in `state.json`.

`repo` is the project's GitHub repository as `owner/name`. Maple runs each `gh` call for the project's PRs on the desktop, against `repo` or the `otherRepos` entry that has the card's PR. The review diff and the merge read from GitHub, and the worktree supplies only the branch name, so they never depend on the contents of a local checkout.

`otherRepos` is optional and lists more `owner/name` repos the project's cards may open PRs in. Maple uses the first repo in `[repo, ...otherRepos]` that has a PR for the card's branch.

`vaultDir` is optional. When set, every card tab can switch its file tree to the Markdown notes in that Obsidian vault and open them read-only next to the card's Claude session. Notes the card's Claude session wrote show as changed.

Maple saves open tabs in `state.json` in `MAPLE_CONFIG_DIR`. At each launch, if `state.json` changed since the last backup, Maple copies it to `state.json.1` and moves older copies up, keeping `stateBackups` copies (default 3) with the newest in `state.json.1`. A `state.json` Maple cannot read moves to `state.json.corrupt`, and the banner names the newest backup. To restore, quit Maple, copy a backup over `state.json`, and start Maple again.

## Status

Maple is a personal proof of concept and is under active development. Expect breaking changes between versions.

## Security Model

Maple runs Claude sessions with permissions skipped and holds a Jira token, so it treats Jira text, PR bodies, file contents, and terminal output as untrusted:

- The renderer is sandboxed and isolated, has a strict Content-Security-Policy, and may not navigate away from the app. Links open in the browser, and only `http` and `https` links.
- The renderer gets clipboard access only. Every other permission, such as notifications, camera, or location, is denied.
- Untrusted text renders as text. A lint rule rejects `innerHTML` and `dangerouslySetInnerHTML`.
- The main process checks every IPC argument, reads files only inside a tab's worktree, and never returns the Jira token.
- `git`, `gh`, and `claude` run with argument arrays, never through a shell.
- The hook socket is private to the user and drops oversized lines.

## Live Tests

`make test-live` runs a real `claude` session with Maple's hooks, fetches the MPL board from Jira, looks up a merged PR with `gh`, and runs preflight, which checks that Claude trusts `~/Documents/code/maple`. It needs `claude` logged in, `gh` logged in, Jira credentials at `MAPLE_JIRA_ENV` (default `~/.config/jira/env`), and this repo cloned at `~/Documents/code/maple`. A run costs a few cents. Run it after upgrading `claude` or `gh`, or when Jira or GitHub responses change. It never runs in CI or `make pre-pr`, only in `make test-live` and `make test-all`. Permission-prompt notifications are not covered, because print mode with permissions skipped never asks for permission.

