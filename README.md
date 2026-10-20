# Maple

Personal agentic IDE for running Jira cards with Claude. Built with Electron, React, and TypeScript.

## Requirements

- Node 24 (see `.nvmrc`)
- A C++ toolchain and Python, for building `node-pty`

## Usage

```bash
make pre-pr  # install dependencies and run format, lint, typecheck, and unit tests, except the socket tests
make test-all  # run every unit test, including the socket tests that CI runs
make run     # start the app in development mode
make test-live  # check Maple's assumptions against the real claude, Jira, and GitHub
```

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

`make test-live` runs a real `claude` session with Maple's hooks, fetches the MPL board from Jira, looks up a merged PR with `gh`, and runs preflight, which checks that Claude trusts `~/Documents/code/maple`. It needs `claude` logged in, `gh` logged in, Jira credentials at `MAPLE_JIRA_ENV` (default `~/.config/jira/env`), and this repo cloned at `~/Documents/code/maple`. A run costs a few cents. Run it after upgrading `claude` or `gh`, or when Jira or GitHub responses change. It never runs in CI or `make pre-pr`. Permission-prompt notifications are not covered, because print mode with permissions skipped never asks for permission.
