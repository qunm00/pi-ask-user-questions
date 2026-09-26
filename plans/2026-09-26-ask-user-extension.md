# Plan: `ask_user` — free-form questions for the user

**Date:** 2026-09-26
**Project root:** `/Users/quannm/Projects/pi-ask-user-questions`
**Target Pi version:** 0.87.1
**Status:** awaiting approval

---

## 1. Goal

The agent can ask the user a question, and the user answers by **typing free-form text** —
no multiple choice. When the agent has more than one question, the user answers them
**one after another** in a single uninterrupted run.

The extension must be publishable as a **Pi package** (npm gallery + `pi install`).

### Explicit non-goals

- No option lists, no `select()` dialogs, no radio buttons.
- No re-asking loop the user cannot escape.

---

## 2. Requirements

| # | Requirement | How it is met |
|---|---|---|
| R1 | Agent-initiated question | Registered as a **tool** (`ask_user`), not a command |
| R2 | User types the answer | `ctx.ui.input()` — free text, single line |
| R3 | Multiple questions answered consecutively | One dialog at a time, in array order |
| R4 | No stacked / interleaved dialogs | `executionMode: "sequential"` |
| R5 | Agent must not pester the user | `promptGuidelines` + `description` written as usage rules |
| R6 | Skipped answers are never invented | Explicit `skipped` markers in the model-facing result |
| R7 | Works in every run mode | `!ctx.hasUI` returns an actionable result, never hangs |
| R8 | Distributable | Package root with `package.json` + `extensions/` |

---

## 3. Verified API findings

Read from the installed package, not from memory. Source paths are relative to
`/usr/local/share/npm-global/lib/node_modules/@earendil-works/pi-coding-agent/`.

| Finding | Source | Consequence |
|---|---|---|
| `ctx.ui.input(title, placeholder?, opts?)` → `Promise<string \| undefined>` | `dist/core/extensions/types.d.ts:75` | **The primitive.** `undefined` = user pressed Escape. |
| `opts` accepts only `signal` and `timeout` | `types.d.ts:37-43` (`ExtensionUIDialogOptions`) | Use only this typed surface, even though the component reads more fields. |
| `ExtensionInputComponent` wraps pi-tui `Input` | `dist/modes/interactive/components/extension-input.js:47` | Confirms **single line**. Also renders a bordered box with submit/cancel key hints. |
| `ctx.ui.editor(title, prefill?)` → `Promise<string \| undefined>` | `types.d.ts` (`ExtensionUIContext`) | Multiline opt-in. **Takes no `signal`** → not abort-safe. |
| `ui.editor()` installs into a single shared `editorContainer` and calls `setFocus`; `input()` shares the same editor area | `dist/modes/interactive/interactive-mode.js:2125-2137` | Two concurrent dialogs would collide → tool **must** be `sequential`. |
| Dialogs are wrapped in `withUIPrompt()` — re-entrant depth counter, emits `ui_prompt_start` / `ui_prompt_end` | `dist/core/extensions/runner.js:323, 328-354` | The runtime explicitly supports sequential/nested UI prompts. |
| `withUIPrompt` only emits events — it does **not** suspend the agent stream | same | A dialog during an active turn is unproven. See Step 1 gate. |
| No UI → `input()` resolves `undefined` immediately (`noOpUIContext`) | `runner.js:133-135` | Non-interactive modes fail fast and safely. No hang. |
| `executionMode?: "sequential" \| "parallel"` on `ToolDefinition` | `types.d.ts:367` | Serializes sibling tool calls from one assistant message. |
| `promptSnippet?: string`, `promptGuidelines?: string[]` | `types.d.ts:352-357` | Mechanism for R5. Guidelines append to the system-prompt Guidelines section. |
| `renderCall?` / `renderResult?` hooks | `types.d.ts:376-379` | Optional pretty transcript. |
| Supplied packages: `pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `typebox` | `docs/packages.md` | Go in `peerDependencies` with `"*"`, never bundled. |

### The one open risk

Whether a dialog renders correctly **while the agent stream is active** cannot be proven
from source — `withUIPrompt` only emits events. Step 1 is a hard gate with a pre-decided
fallback (use `ui.editor()`, the path `examples/extensions/question.ts` uses).

---

## 4. Design

### 4.1 Tool schema

```ts
questions: Array<{
  question:     string   // required
  hint?:        string   // why you are asking — shown as context
  placeholder?: string   // example of the expected shape of the answer
  multiline?:   boolean  // opt into ui.editor()
}>                       // minItems: 1, maxItems: 10
```

`executionMode: "sequential"` — non-negotiable, see R4.

### 4.2 Ask loop

For each question, in array order:

1. Title: `Question ${i+1} of ${n}` plus the question text. `hint` appended as context.
2. `multiline` → `ctx.ui.editor(title, prefill)`; otherwise
   `ctx.ui.input(title, placeholder, { signal })`.
3. `undefined` (Escape) → mark `skipped: true`, **continue to the next question**.
4. Whitespace-only → re-prompt once with an inline hint
   (*"Empty answer — press Escape to skip"*); still empty → `skipped: true`.
5. If `signal` aborts → stop the loop, return what was collected with `aborted: true`.

### 4.3 Two ways "consecutive" is satisfied

Works no matter how the agent calls it:

- **One call, N questions** → N dialogs in sequence inside a single `execute()`.
- **N separate calls in one turn** → `executionMode: "sequential"` queues them; the
  runtime runs one at a time, so dialogs still never stack.

### 4.4 Anti-pester rules (R5)

`promptGuidelines` bullets, appended to the system prompt when the tool is active:

- Batch every question you need into a **single** `ask_user` call.
- Ask only when you genuinely cannot proceed. Never ask what you can read, infer, or
  decide yourself.
- State an assumption and continue instead of asking.
- Never invent an answer the user did not give.

`description` restates the above in model-facing terms, and notes that answers are typed,
not chosen from a list.

### 4.5 Result contract

Model-facing `content` — a plain transcript:

```
Q1: <question>
A1: <answer>

Q2: <question>
A2: (skipped — user did not answer)
```

Plus, when anything was skipped or aborted:

> The user did not answer 1 of 2 questions. Do not fabricate an answer — either re-ask or
> proceed without it.

`details` (per `docs/extensions.md` state table — tool-result `details` is the right home
for state that follows the active branch):

```ts
{
  questions: Array<{ question: string; hint?: string; answer: string; skipped: boolean }>,
  aborted: boolean
}
```

### 4.6 No-UI path (R7)

If `!ctx.hasUI`, return a result telling the model to ask in plain text instead of calling
the tool. Fail loudly and actionably rather than silently returning empty answers.

### 4.7 Resolved design decisions

| Question | Decision | Why |
|---|---|---|
| Empty input | Re-prompt once, then skip | A stray Enter is likelier than a deliberate blank; one extra keystroke is cheap |
| Escape semantics | Skip that question only, continue the batch | Preserves momentum; skips are reported, so nothing is lost silently |
| Skipped questions | Return partial results, do not fail the tool | The agent chooses to re-ask or proceed on assumptions |
| Multiline | Include the flag | `input()` stays the abort-safe default; `editor()` is opt-in with a documented caveat |

---

## 5. File layout

The package root **is** the project root, so one copy of the source serves both local
loading and publishing.

```
pi-ask-user-questions/
├── package.json                     # name, keywords:["pi-package"], pi manifest, peerDeps
├── README.md                        # install + agent-facing usage rules
├── plans/
│   └── 2026-09-26-ask-user-extension.md   # this file
├── extensions/
│   └── ask-user.ts                  # the extension (single file, zero runtime deps)
└── .pi/
    ├── settings.json                # created by: pi install ./ --local
    ├── sessions/                    # existing
    └── state/                       # (currently under ./pi/.pi/state — left alone)
```

### Important: do not also put the file in `.pi/extensions/`

`.pi/extensions/` (project extension dir) and `extensions/` (package dir) are two
different load mechanisms. Using both registers `ask_user` **twice** — duplicate tool,
confusing transcript. Single source of truth: `extensions/ask-user.ts` only.

### Iteration vs. installed loading

```bash
# dev loop, no install, no settings change
pi -e ./extensions/ask-user.ts

# install as a project package -> loads automatically in this project
pi install ./ --local          # writes .pi/settings.json, requires project trust

pi list                        # confirm
pi remove ./                   # uninstall
```

---

## 6. Implementation steps

### Step 1 — Spike and gate

Scaffold `extensions/ask-user.ts` with **only** a `/ask-demo` command that runs two
batched questions through the real dialog.

```bash
pi -e ./extensions/ask-user.ts
# then type: /ask-demo
```

- **Gate passes** → dialog renders mid-session. Continue to Step 2 as designed.
- **Gate fails** → switch the primitive to `ui.editor()` and race it against `signal`
  manually, documenting that Escape is the only reliable dismissal. Then continue.

### Step 2 — Implement the tool

Schema, `executionMode: "sequential"`, the ask loop, skip/abort semantics, `details`,
`promptSnippet` / `promptGuidelines`, and the `!hasUI` path. Register the `/ask-demo`
command alongside it.

### Step 3 — Package manifest

`package.json` with `keywords: ["pi-package"]`, a `pi` manifest pointing at
`./extensions/ask-user.ts`, and `peerDependencies` for the supplied Pi packages at `"*"`.
No `dependencies` — zero runtime deps.

### Step 4 — Verify with a real model

Start a session in the project root. Confirm:

- [ ] A question that warrants input produces **one** dialog sequence.
- [ ] Multiple questions appear consecutively, titled `Question 1 of n`, `Question 2 of n`.
- [ ] The agent does **not** ask for things it could determine itself.
- [ ] The answer text reaches the model intact.

### Step 5 — Edge cases

- [ ] Escape mid-batch → remaining questions still asked, skips reported.
- [ ] Abort (Esc / ctrl+c) during a dialog → no hang, partial result returned.
- [ ] 3+ questions in one call.
- [ ] Agent makes 3 separate calls in one assistant message → serialized, never stacked.
- [ ] Run in `print` / `json` mode → actionable message, no hang.

### Step 6 — README and publish path

`README.md` with install instructions and the agent-facing rules, then whichever
distribution route applies:

- **Local / git:** `pi install git:github.com/<you>/pi-ask-user-questions@v1`
- **npm gallery:** `npm publish` — the `pi-package` keyword makes it eligible for
  [pi.dev/packages](https://pi.dev/packages). Optionally add `pi.image` / `pi.video`
  previews. Consumers install with `pi install npm:<name>` and can trial it with
  `pi -e npm:<name>`.

---

## 7. Open questions

None blocking. Recorded here in case any decision should be revisited during Step 4–5:

1. Should a skipped question cause the tool to `terminate` so the agent immediately
   re-asks, or return partial results as designed? (Currently: partial results.)
2. Should the dialog show which question is next while the current one is open
   (e.g. a footer hint "3 of 5"), or is the title alone enough?
3. Should answers be persisted via `pi.appendEntry()` for cross-session recall, or stay
   branch-local in tool-result `details`? (Currently: `details` only.)
