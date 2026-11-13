# Trust Model

Maple is a desktop app that runs Jira cards with Claude sessions. Taylor is its only user, on their own machine.

## Principles

- `public-design`: the code, this model, and past findings are public, so every control must hold even when an
  attacker knows it.

## Assets

- `desktop`: Taylor's machine and home folder, where Maple, git, gh, and shells run unsandboxed. Losing it means full
  control of Taylor's account.
- `jira-token`: the Jira user token in the shared env file, passed into every session. If it leaks, someone could read
  and change every card Taylor can reach.
- `github-access`: the gh login Maple uses to merge, and the long-lived GitHub token sessions hold for all repos. If
  misused, any repo's code, workflows, webhooks, and secrets can change.
- `main-code`: what lands on `main`, which Taylor later builds and runs. A backdoor there runs on the desktop.
- `claude-account`: Taylor's Claude login, settings, memory, skills, and spending. Misuse means a runaway bill or
  poisoned instructions for later sessions.
- `vault`: the Obsidian vault, which card sessions can write. Notes could leak or change.
- `findings`: each card's security findings and Taylor's decisions. Forged entries hide real risks.
- `logs`: the main log, the event log, and bug report log tails. They should hold nothing sensitive; a slip leaks into
  Jira.

## Who Might Attack

The main threat is a well-meaning Claude session that does harm it does not recognize.

- `misled-session`: a Claude session steered by text it reads, a malicious skill or plugin, or code it runs. It reaches
  the sessions, hook server, config dir, vault, Claude config, main process, shell terminals, Jira and GitHub, the
  app window (through text Maple shows), and CI (through workflow changes).
- `public-reader`: anyone who reads the public code and findings to plan an attack, opens fork PRs, or comments on
  Taylor's PRs. It reaches CI, the app window, and sessions; Maple ignores fork PRs but shows every author's review
  comments, and sessions read them.
- `malicious-dependency`: a bad npm package or GitHub Action. It reaches CI, sessions, and the shipped app.

## Trust Boundaries

Maple has ten parts:

- `renderer`: the sandboxed app window.
- `main-process`: the Node process that runs git, gh, the Jira client, the pollers, and IPC handlers.
- `hook-server`: the hook script Claude runs and the socket that takes its events.
- `sessions`: Claude sessions in tmux, with permissions skipped and Claude's Bash sandbox from user settings.
- `shell-terminals`: plain shells in a card tab that Taylor drives, with no sandbox.
- `config-dir`: Maple's config, state, logs, events, findings, and snapshots.
- `vault`: the Obsidian vault folder.
- `claude-config`: the global `~/.claude`, symlinked to the dotclaude repo.
- `outside-services`: Jira and GitHub, reached as Taylor.
- `ci`: GitHub Actions on every PR and push to `main`.

The boundaries between them:

- `renderer-to-main`: IPC calls from the window. Every argument gets a schema check, and the window is sandboxed with a
  strict CSP. The sender frame is not checked.
- `main-to-renderer`: outside text such as cards, PR comments, files, and terminal output. It renders as text, except
  code blocks, which Monaco's colorizer draws as escaped HTML. Links open in the browser.
- `main-to-sessions`: Maple starts Claude with permissions skipped, relying on the Bash sandbox in user settings. Maple
  neither turns the sandbox on nor warns when it is off. Sessions hold the Jira token and a broad GitHub token.
- `sessions-to-hook-server`: one JSON line per hook event, on a private socket, size-limited and validated. Events
  carry no commands.
- `sessions-to-main-files`: worktrees, git config, findings, and notes Maple reads. git runs with fsmonitor off, and
  findings are size-limited and shown as text. Any session can forge any card's findings.
- `sessions-to-host-files`: Claude's Write and Edit tools are not covered by the Bash sandbox. They can write anywhere
  Taylor can except a short deny list, including the installed app, shell startup files, and Claude config.
- `main-to-outside`: Jira and gh calls as Taylor, with timeouts, argument arrays, fork PRs ignored, and merges pinned to
  the head commit.
- `github-to-ci`: PRs trigger CI with a read-only token. `main` needs a PR and passing checks but no approval; five jobs
  pin actions to tags, and audit and package are not required.

## Users and Access

- `taylor`: the owner, who can do everything. Access is the desktop login, gh as repo owner, the Jira user token, and
  the Claude login.
- `claude-session`: every session Maple starts, acting for Taylor. It can change cards, write to and merge on every
  repo, and write files anywhere Taylor can, but cannot change rulesets.

## Build, Deploy, and Monitor

Sessions run `make pre-pr` in the sandbox, and GitHub Actions runs format, lint, typecheck, tests, audit, package, and
e2e on every PR. Taylor runs `make install` from the main checkout after a pull; the build is unsigned and nothing
checks its commit. `make try` runs unreviewed branch code on the desktop. Monitoring is the scrubbed main log, the
event log, state backups, the Findings tab, and bug reports, with no alerts. The Security Pass reads this model from
the PR's base commit, so a PR cannot loosen its own review, and raises every edit to it as a finding for Taylor.

## Accepted Risks

Design risks accepted until Xena moves sessions into a VM:

- `sessions-to-host-files`: sessions can write anywhere Taylor can through the Write and Edit tools.
- `main-to-sessions`: sessions hold the Jira token and a long-lived GitHub token for all repos.
- `github-to-ci`: `main` needs no approval, so only the `/card` skill and Maple's Approve button stop a session merging
  its own PR.
- `deployed`: `make try` runs unreviewed code on the desktop, and nothing checks which commit the installed app came
  from.

Risks accepted from findings:

## Severity Overrides

None yet.
