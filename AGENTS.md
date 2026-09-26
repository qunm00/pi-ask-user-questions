# AGENTS.md

## Learned User Preferences

- Prefers a plain typed answer over multiple choice: when the agent asks a question, present it and let them type the reply.
- Questions should arrive one at a time in sequence; batched questions get answered consecutively in a single run.
- Wants a written plan saved under `plans/` (date-prefixed filename) before implementation starts.
- Prefers existing, purpose-built tooling over hand-rolled substitutes (asked for `@marcfargas/pi-test-harness` instead of a self-written harness).
- Names tools and packages directly and expects them to be verified to exist before anything is swapped in — do not guess a dependency.
- Grants a chained go-ahead ("do X, then Y") and expects the whole sequence carried out without pausing to re-confirm each step.

## Learned Workspace Facts

- Repo root is `/Users/quannm/Projects/pi-ask-user-questions`; the empty `pi/` subdirectory is legacy, not an extension location — all project work belongs at the root.
- This repo is the Pi package `pi-ask-user` (`keywords: ["pi-package", "pi", "pi-extension"]`); the single extension source is `extensions/ask-user.ts`, declared in the `pi.extensions` manifest field.
- The package root is the repo root, not `.pi/extensions/` — those are two different load mechanisms and would register the tool twice.
- Pi packages (`pi-ai`, `pi-agent-core`, `pi-coding-agent`) are `peerDependencies` at `*` and never bundled; there are zero runtime dependencies; `files` publishes only `extensions/**/*.ts`, `README.md`, `LICENSE`.
- Pinned toolchain: Pi 0.87.1, strict TypeScript, vitest 3, and `@marcfargas/pi-test-harness` 0.6.1 as the extension test harness.
- Commands: `npm test` (vitest run), `npm run typecheck` (`tsc --noEmit`); extension dev loop is `pi -e ./extensions/ask-user.ts`.
- Tests live in `__tests__/*.test.ts` with the pi 0.87 bridge in `__tests__/support/pi-compat.ts`; `vitest.config.ts` must inline the harness, because vitest externalizes `node_modules` and would otherwise bypass `resolve.alias` silently.
- pi 0.87 skew the harness must bridge: `agent.streamFn` was renamed `agent.streamFunction`, `getModel` moved to `@earendil-works/pi-ai/compat`, and `agent.setTools` is gone so the harness's `mockTools` silently no-ops.
- In the harness, `mockUI: { input: undefined }` does not simulate Escape (the documented default `input -> ""` wins); cancellation requires `input: () => undefined`.
- `ask_user` is agent-initiated, so it is registered as a tool with `executionMode: "sequential"` and prompts via `ctx.ui.input()`; `/ask-demo` is the manual TTY smoke command.
- Plans are kept in `plans/` as date-prefixed markdown and updated in place as steps land.
- `.pi/` (sessions, state, settings) is gitignored as machine-local state; git identity is repo-scoped to a bot `pi-agent` identity and commits use conventional-commit style.
