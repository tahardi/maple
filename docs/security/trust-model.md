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
- `vm-ssh-key`: the YubiKey-backed SSH key and the pinned VM host key file. If misused, someone could run commands in
  the VM, or Maple could trust a fake VM.

## Who Might Attack

The main threat is a well-meaning Claude session that does harm it does not recognize.

- `misled-session`: a Claude session steered by text it reads, a malicious skill or plugin, or code it runs. It reaches
  the sessions, hook server, config dir, vault, Claude config, main process, shell terminals, Jira and GitHub, the
  app window (through text Maple shows), CI (through workflow changes), the Xena VM, and Obsidian (through the
  notes and link handlers it can write).
- `public-reader`: anyone who reads the public code and findings to plan an attack, opens fork PRs, or comments on
  Taylor's PRs. It reaches CI, the app window, and sessions; Maple ignores fork PRs but shows every author's review
  comments, and sessions read them.
- `malicious-dependency`: a bad npm package or GitHub Action. It reaches CI, sessions, and the shipped app.

## Trust Boundaries

Maple has thirteen parts:

- `renderer`: the sandboxed app window.
- `main-process`: the Node process that runs git, gh, the Jira client, the pollers, and IPC handlers.
- `hook-server`: the hook script Claude runs and the socket that takes its events.
- `sessions`: Claude sessions in tmux, with permissions skipped and Claude's Bash sandbox forced on by Maple.
- `shell-terminals`: plain shells in a card tab that Taylor drives, with no sandbox.
- `config-dir`: Maple's config, state, logs, events, findings, and snapshots.
- `vault`: the Obsidian vault folder.
- `claude-config`: the global `~/.claude`, symlinked to the dotclaude repo.
- `outside-services`: Jira and GitHub, reached as Taylor.
- `ci`: GitHub Actions on every PR and push to `main`.
- `xena-vm`: the Xena VM, reached over one SSH master connection whose control socket is in Maple's config dir.
- `vault-gateway`: the desktop vault gateway socket, forwarded into the VM at `~/.xena/vault.sock`.
- `obsidian`: Obsidian, or whatever app is registered for `obsidian://` links, which Maple asks to open vault notes.

The boundaries between them:

- `renderer-to-main`: IPC calls from the window. Every argument gets a schema check, and the window is sandboxed with a
  strict CSP. The sender frame is not checked.
- `main-to-renderer`: outside text such as cards, PR comments, files, and terminal output. It renders as text, except
  code blocks, which Monaco's colorizer draws as escaped HTML. Links open in the browser.
- `main-to-sessions`: Maple starts Claude with permissions skipped. Maple's settings file turns the Bash sandbox on
  with no escape hatch, and a session refuses to start if the sandbox cannot run. Startup warns when user settings
  have the sandbox off. A worktree's own settings can still add sandbox exceptions. Sessions hold the Jira token and
  a broad GitHub token.
- `sessions-to-hook-server`: one JSON line per hook event, on a private socket, size-limited and validated. Events
  carry no commands.
- `sessions-to-main-files`: worktrees, git config, findings, and notes Maple reads. git runs with fsmonitor off, and
  findings are size-limited and shown as text. Any session can forge any card's findings.
- `sessions-to-host-files`: Claude's Write and Edit tools are not covered by the Bash sandbox. They can write anywhere
  Taylor can except a short deny list, including the installed app, shell startup files, and Claude config.
- `main-to-outside`: Jira and gh calls as Taylor, with timeouts, argument arrays, fork PRs ignored, and merges pinned to
  the head commit.
- `vm-to-desktop`: command output, file reads, and log lines from the VM, and VM requests through the forwarded vault
  socket. SSH pins the host key, ignores ssh config, turns off agent and X11 forwarding, quotes every argument, sends
  environment values outside the command line, and limits output size and time. Maple treats VM output as untrusted,
  and only the gateway checks vault requests. Any desktop process running as Taylor can reuse the open SSH connection
  without a touch.
- `main-to-obsidian`: Open in Obsidian hands one `obsidian://open` link to the desktop's link handler. Only Markdown
  notes inside the vault get through, with symlinks resolved and broken links refused, and the path is encoded.
  Whatever app is registered for those links runs, and Obsidian opens notes sessions wrote with its plugins active.
- `github-to-ci`: PRs trigger CI with a read-only token, and every action is pinned to a commit that Dependabot keeps
  current. `main` needs a PR and passing checks but no approval; audit and package are not required.

## What We Trust

Any part that runs Claude can be misled, so its trust is a best effort and its limits carry the weight.

- `renderer`: trusted with drawing outside text and passing Taylor's clicks and keystrokes on. Limited by the window
  sandbox, a strict CSP, the schema check on every IPC call, and file access only inside the worktree or the vault.
- `main-process`: trusted with Taylor's gh login and Jira token, merging PRs, starting sessions, findings and
  decisions, and the VM's SSH connection. Nothing limits it; it is the trusted base.
- `hook-server`: trusted with passing session events to the main process. Limited by a private socket, validation of
  every line, and events that carry no commands.
- `sessions`: trusted with a best-effort try at the card's task, and not with an honest report on its own work. Limited
  by the Bash sandbox Maple forces on and the folders it may write. Its Write and Edit tools and its credentials reach
  further, accepted until Xena.
- `shell-terminals`: trusted with whatever Taylor types. Nothing limits it; it is the trusted base.
- `config-dir`: trusted with Maple's settings, state, logs, findings, decisions, and the SSH control socket. Limited
  only by file permissions and the checks the main process runs on what it reads back; any session can write it.
- `vault`: trusted with Taylor's notes. Limited by notes shown as text and access only inside the vault; any session
  can change any note.
- `claude-config`: trusted with the skills, hooks, settings, and memory every session follows. Limited by Maple's
  settings file outranking a worktree's, and by reviewed PRs to dotclaude; sessions can still edit it directly.
- `outside-services`: trusted with cards, code, PRs, and the checks that guard `main`. Limited by branch rules that need
  a PR and passing checks, but no approval.
- `ci`: trusted with running the checks on every PR. Limited by a read-only token, no `pull_request_target`, and
  actions pinned to commits.
- `xena-vm`: trusted with running Xena's work and sending back output. Limited by a pinned host key, no forwarding of
  the agent or X11, size and time limits, and Maple treating its output as untrusted.
- `vault-gateway`: trusted with deciding which vault requests from the VM to allow. Its limits are unknown; they live
  in Xena.
- `obsidian`: trusted with opening one vault note when Taylor asks. Limited to Markdown notes inside the vault, but
  whatever app owns `obsidian://` links runs with its plugins.

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

- Forced sandbox can still be widened by a worktree's own Claude settings or by editing the shared hooks file (MPL-392 F1): We only have to live with this shortcoming until we have Xena in-place to sandbox Claude
- A decided finding's likelihood, attacker, or recommendation can change while Taylor's decision stays (MPL-419 F1): Those fields are known to not be trusted. We fingerprint what we can control
- Sessions can write Maple's decisions record directly and give it a matching fingerprint (MPL-419 F3): This is the known gap, accepted until Xena, that lets sessions write anywhere Taylor can. The fingerprint method is public and has no secret, so only moving sessions into the VM closes it.

## Severity Overrides

None yet.
