# AGENTS.md

## Learned User Preferences

- Prefers a plain typed answer over multiple choice: when the agent asks a question, present it and let them type the reply.
- Questions should arrive one at a time in sequence; batched questions get answered consecutively in a single run.
- Wants a written plan saved under `plans/` (date-prefixed filename) before implementation starts, and updated in place as steps land.
- Prefers existing, purpose-built tooling over hand-rolled substitutes (asked for `@marcfargas/pi-test-harness` instead of a self-written harness).
- Names tools and packages directly and expects them to be verified to exist before anything is swapped in — do not guess a dependency.
- Grants a chained go-ahead ("do X, then Y") and expects the whole sequence carried out without pausing to re-confirm each step.
- Works one plan step at a time with a review gate: says "move on" only after the step is finished, tests pass, and it is committed — never start the next step early.
- Wants releases human-gated: stage the tarball for manual 2FA approval rather than publishing automatically.

## Learned Workspace Facts

- Repo root is `/Users/quannm/Projects/pi-ask-user-questions`, and it is also the package root — not `.pi/extensions/`, which is a different load mechanism and would register the tool twice. The `pi/` subdirectory is a stray duplicate state dir (only a gitignored `pi/.pi/state/`), not an extension location.
- This repo is the Pi package `pi-ask-user-questions` (`keywords: ["pi-package", "pi", "pi-extension"]`); the single extension source is `extensions/ask-user.ts`, declared in the `pi.extensions` manifest field. It was renamed from `pi-ask-user` because that npm name is taken by a different, actively maintained option-selection package, and the README positions this one against it.
- Pi supplies `typebox` and the `@earendil-works/*` packages, so they are `peerDependencies` at `*` and never bundled; there are zero runtime dependencies, and the `files` allowlist yields a 4-file tarball (LICENSE, README.md, extensions/ask-user.ts, package.json) that CI asserts exactly.
- Toolchain: Pi 0.87.1, Node >= 22.19.0 (pi's own floor), strict TypeScript, vitest 3, Biome 2.x for formatting and non-type-aware linting (chosen over ESLint — do not add ESLint), and `@marcfargas/pi-test-harness` 0.6.1 as the extension test harness.
- Commands: `npm run verify` (lint + typecheck + test), `npm test` (vitest run, includes the slow pack+install+load check), `npm run test:unit` (skips it), `npm run lint` / `lint:fix` (Biome), `npm run typecheck` (`tsc --noEmit`); extension dev loop is `pi -e ./extensions/ask-user.ts` then `/ask-demo`.
- Tests live in `__tests__/*.test.ts` with the pi 0.87 bridge in `__tests__/support/pi-compat.ts`; `vitest.config.ts` must inline the harness, because vitest externalizes `node_modules` and would otherwise bypass `resolve.alias` silently.
- The harness targets pi 0.75; the 0.87 skew it needs bridged is `agent.streamFn` → `agent.streamFunction`, `getModel` moved to `@earendil-works/pi-ai/compat`, and `agent.setTools` being gone so `mockTools` silently no-ops. A weekly `pi@latest` CI job exists to catch those shims breaking.
- Harness gotchas: `mockUI: { input: undefined }` does not simulate Escape (the documented default `input -> ""` wins) — use `input: () => undefined`; a `UICallRecord` is `{ method, args, returnValue }` with no `title`; and the smoke check's `remaining` is a count, not an array.
- `ask_user` is agent-initiated, so it is registered as a tool with `executionMode: "sequential"` and prompts via `ctx.ui.input()`; in pi 0.87.1 the input's placeholder argument is silently dropped (held as `_placeholder`), so the dialog title is the only rendering channel and must carry the question, the "N of M" counter and any hint. `/ask-demo` is the manual TTY gate, since the harness substitutes `ctx.ui.*` and no automated test can check rendering.
- The harness playbook emits one tool call per message and never aborts a turn, so abort-mid-dialog, no-UI (`print`/`json` mode) and batch-limit cases are tested by calling the registered tool's `execute()` directly with a crafted context and `AbortSignal`; `minItems`/`maxItems` are validated by pi before `execute`, so direct calls bypass them and the test asserts the declared contract instead.
- Two GitHub workflows: `ci.yml` (lint/typecheck/test on a Node 22.19 + 24 matrix, the weekly `pi@latest` job, and a package-integrity job asserting the exact 4-file tarball plus the pi manifest metadata) and `release.yml` (on `v*` tags: requires tag == `package.json` version, pins npm 12+, and uses `npm stage publish` for a non-public staged upload that only becomes installable after a maintainer's 2FA `npm stage approve`). Tags so far: `v0.1.0`, `v0.1.1`.
- `.pi/` (sessions, state, settings) is gitignored as machine-local state and must not be committed; git identity is repo-scoped to a bot `pi-agent` identity, commits use conventional-commit style, and origin is `github.com/qunm00/pi-ask-user-questions`.
