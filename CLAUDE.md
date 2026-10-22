# Maple

Personal agentic IDE for running Jira cards with Claude. Electron main process, React renderer, TypeScript throughout.

## General

- Never add code comments unless the card asks for one - the code and the card are the documentation.
- Keep lines at 120 characters or less - Prettier enforces it with `.prettierrc`.
- One component, hook, or module per file - small focused files are easier to review.
- Group files by topic in folders: `src/main/<topic>/`, `src/renderer/src/<area>/<topic>/`, `src/shared/types/<subject>.ts` - put a new file next to what it works with, and start a new folder once a topic has more than one file.
- Name components `PascalCase.tsx` and everything else `camelCase.ts` - the name tells you what the file holds.
- Error messages are present tense and start with an "-ing" verb, like `reading config: x` - they read as a trail.
- Pin dependencies exactly with `npm install --save-exact` - builds stay reproducible.
- Jira status names are exactly `To Do`, `In Progress`, `In Review`, `Done` - other spellings break transitions.

## TypeScript

- Keep `strict: true` - the compiler catches what tests miss.
- No `any` - use `unknown` and narrow it, so the types stay honest.
- No non-null assertions (`!`) - check for null and handle it.
- No `@ts-ignore` - fix the type error instead of hiding it.
- Every lint disable carries a reason: `// eslint-disable-next-line rule -- reason` - so it can be judged later.
- Use `type` over `interface`, except for `MapleApi` - one way to declare shapes; `MapleApi` augments `Window`.
- Named exports only, except where a tool requires a default (config files) - names match at every import site.
- No enums - use string unions, which need no runtime code and compare as plain strings.
- Throw `Error` subclasses only when a caller branches on them - otherwise a plain `Error` message is enough.
- Async functions return `Promise<T>` and never mix in callbacks - one way to wait for a result.

## React

- Function components only - hooks need them and they are shorter than classes.
- Props arrays are `readonly` - components never mutate what they are given.
- Hooks start with `use` and live in their own file - the rules of hooks rely on the name.
- No `useEffect` for derived state - compute it during render, which avoids an extra render and stale values.
- Read the zustand store through selectors, like `useStore((s) => s.cards)` - re-render only on that slice.

## Electron

- The renderer talks to the main process only through `window.maple` - one typed, audited IPC surface.
- The main process never imports from `src/renderer` - it runs in Node, not the browser.
- The renderer never imports Node or Electron modules - it runs sandboxed in the browser.
- Both sides may import `src/shared` - shared types and pure helpers live there.
- Spawn every Claude session with `--dangerously-skip-permissions` and `--settings <hooks file>` - no opt out.
- The config dir is `MAPLE_CONFIG_DIR`, default `~/.config/maple` - tests point it at a temp dir.
- Read Jira credentials from `MAPLE_JIRA_ENV`, default `~/.config/jira/env` - the file other tools share.
- Never log or display the Jira token - logs and screenshots get shared.

## Tests

- Tests sit next to the file they test: `foo.ts` and `foo.test.ts` - easy to find and to keep in sync.
- Use `describe('<unit>')` and `test('<behavior>')` - the output reads as a spec.
- Split each test into `// given`, `// when`, `// then` sections - setup, action, and check stay distinct.
- Use `test.each` tables where cases share a shape - one body, many cases.
- Write the test first and see it fail before implementing - a test that never failed proves nothing.
- Never call real Jira, GitHub, or `claude` - Jira and GitHub tests use recorded JSON in `test/fixtures/`.
- Run `git` only on repos built in a temp dir - tests never touch a real checkout.
- Mock `node-pty` in session tests - no real terminals in CI.
- Sessions run only `make pre-pr` - the sandbox blocks Unix sockets and the display, so `make test-socket`,
  `make test-e2e`, `make run`, and `make try` fail there by design; CI runs the tests and Taylor runs the app.
  `make test-live` costs money and is Taylor's to run.
- Hand-test visible changes with `make try` in the card's worktree, never by restarting the real Maple - it has its own sessions, so closing it is safe.
- Made-up cards for hand testing go in the real Jira project with the `test-card` label and a `[TEST]` summary prefix; move them to `Done` when finished - so they never pass for real work.
