# Maple

Personal agentic IDE for running Jira cards with Claude. Built with Electron, React, and TypeScript.

## Requirements

- Node 24 (see `.nvmrc`)
- A C++ toolchain and Python, for building `node-pty`

## Usage

```bash
make pre-pr  # install dependencies, then run format, lint, typecheck, and test-unit
make format  # check formatting (npm run format fixes it)
make lint
make typecheck
make test-unit  # run the unit tests, except the socket tests
make test-socket  # run the tests that open Unix sockets, which sandboxed runs cannot do
make test-e2e  # build the app and run the Playwright smoke test
make test-all  # run test-unit, test-socket, test-live, and test-e2e
make clean  # delete node_modules and build and test output
make run     # start the app in development mode
make test-live  # check Maple's assumptions against the real claude, Jira, and GitHub
```

## Config

Maple reads `config.json` from `MAPLE_CONFIG_DIR` (default `~/.config/maple`). `~` expands to your home directory.

```json
{
  "worktreesDir": "~/Documents/code/wts",
  "vaultDir": "~/Documents/obsidian-vault",
  "notifications": true,
  "projects": [{ "name": "Maple", "jiraKey": "MPL", "jiraBoardId": 1, "plannerDir": "~/Documents/code/maple" }]
}
```

`vaultDir` is optional. When set, every card tab can switch its file tree to the Markdown notes in that Obsidian vault and open them read-only next to the card's Claude session. Notes changed in the last 24 hours show as changed.

## Status

Maple is a personal proof of concept and is under active development. Expect breaking changes between versions.

## Security Model

Maple runs Claude sessions with permissions skipped and holds a Jira token, so it treats Jira text, PR bodies, file contents, and terminal output as untrusted:

- The renderer is sandboxed and isolated, has a strict Content-Security-Policy, and may not navigate away from the app. Links open in the browser, and only `http` and `https` links.
- Untrusted text renders as text. A lint rule rejects `innerHTML` and `dangerouslySetInnerHTML`.
- The main process checks every IPC argument, reads files only inside a tab's worktree, and never returns the Jira token.
- `git`, `gh`, and `claude` run with argument arrays, never through a shell.
- The hook socket is private to the user and drops oversized lines.

## Live Tests

`make test-live` runs a real `claude` session with Maple's hooks, fetches the MPL board from Jira, looks up a merged PR with `gh`, and runs preflight, which checks that Claude trusts `~/Documents/code/maple`. It needs `claude` logged in, `gh` logged in, Jira credentials at `MAPLE_JIRA_ENV` (default `~/.config/jira/env`), and this repo cloned at `~/Documents/code/maple`. A run costs a few cents. Run it after upgrading `claude` or `gh`, or when Jira or GitHub responses change. It never runs in CI or `make pre-pr`, only in `make test-live` and `make test-all`. Permission-prompt notifications are not covered, because print mode with permissions skipped never asks for permission.
