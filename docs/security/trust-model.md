# Trust Model

Maple is a desktop app that runs Jira cards with Claude sessions. Taylor is its only user, on their own machine. Its
code, this model, and past security findings are public, so every control must hold even when an attacker knows it.
The main threat is a well-meaning Claude session that does harm it does not recognize. Many of the gaps below close
when Xena moves sessions into a VM.

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

- `misled-session`: a Claude session steered by text it reads, a malicious skill or plugin, or code it runs. It reaches
  the sessions, hook server, config dir, vault, Claude config, main process, shell terminals, and Jira and GitHub.
- `public-reader`: anyone who reads the public code and findings to plan an attack, or opens fork PRs. It reaches CI
  only; Maple ignores fork PRs and other people's comments.
- `malicious-dependency`: a bad npm package or GitHub Action. It reaches CI, sessions, and the shipped app.

## Trust Boundaries

The parts are the `renderer`, `main-process`, `hook-server`, `sessions`, `shell-terminals`, `config-dir`, `vault`,
`claude-config`, `outside-services` (Jira and GitHub), and `ci`.

- `renderer-to-main`: IPC calls from the window. Every argument gets a schema check, and the window is sandboxed with a
  strict CSP. The sender frame is not checked.
- `main-to-renderer`: outside text such as cards, PR comments, files, and terminal output. It renders as text, never
  HTML, and links open in the browser.
- `main-to-sessions`: Maple starts Claude with permissions skipped and the Bash sandbox on. Sessions hold the Jira
  token and a broad GitHub token.
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
event log, state backups, the Findings tab, and bug reports, with no alerts.

## Accepted Risks

None recorded from findings yet. These design risks are accepted until Xena lands:

- Sessions can write anywhere Taylor can through the Write and Edit tools.
- Sessions hold the Jira token and a long-lived GitHub token for all repos.
- `main` needs no approval, so only the `/card` skill and Maple's Approve button stop a session merging its own PR.
- `make try` runs unreviewed code on the desktop, and nothing checks which commit the installed app came from.

## Severity Overrides

None yet.
