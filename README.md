# Maple

Personal agentic IDE for running Jira cards with Claude. Built with Electron, React, and TypeScript.

## Requirements

- Node 24 (see `.nvmrc`)
- A C++ toolchain and Python, for building `node-pty`

## Usage

```bash
make pre-pr  # install dependencies and run format, lint, typecheck, and unit tests
make run     # start the app in development mode
make test-live  # check Maple's assumptions against the real claude, Jira, and GitHub
```

## Status

Maple is a personal proof of concept and is under active development. Expect breaking changes between versions.

## Live Tests

`make test-live` runs a real `claude` session with Maple's hooks, fetches the MPL board from Jira, looks up a merged PR with `gh`, and runs preflight, which checks that Claude trusts `~/Documents/code/maple`. It needs `claude` logged in, `gh` logged in, Jira credentials at `MAPLE_JIRA_ENV` (default `~/.config/jira/env`), and this repo cloned at `~/Documents/code/maple`. A run costs a few cents. Run it after upgrading `claude` or `gh`, or when Jira or GitHub responses change. It never runs in CI or `make pre-pr`. Permission-prompt notifications are not covered, because print mode with permissions skipped never asks for permission.
