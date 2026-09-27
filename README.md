# pi-ask-user-questions

**The agent asks a question. You type the answer. There is no list to pick from.**

If you want the agent to *offer you options* — searchable lists, multi-select, split-pane
previews, overlay modes — use [`pi-ask-user`](https://www.npmjs.com/package/pi-ask-user)
instead. It is further along and does more. This package is for the other case: you want
to be **asked in words and answer in words**, and you want to be asked **less**.

## How it differs

|  | `pi-ask-user-questions` (this) | `pi-ask-user` |
|---|---|---|
| Answer format | free-form text, always | option list, with freeform as an extra |
| Interaction | one question, one text field | menus, multi-select, split-pane preview, configurable overlay/inline |
| Effect on interruptions | guidelines push the agent to ask **less** | bundles a skill that **mandates** asking at decision gates |
| Maturity | new | 25 published versions, actively maintained |

That last row is the real trade. This package is deliberately narrower: fewer moving parts,
and one abort-safe input path instead of a configurable TUI. If you want richer selection
UI, the other package is the better tool and there is no reason to fight it.

## The anti-pester stance

The usual failure mode is an agent that asks about everything. Three things push back,
all in the tool's `promptGuidelines` — which Pi appends to your system prompt while the
tool is active:

- **Batch everything into one call.** The agent collects all its questions up front, so you
  answer in a single pass instead of being interrupted repeatedly.
- **Don't ask what you can work out.** Reading the repo, inferring, or choosing a sensible
  default is preferred over asking. State the assumption and move on.
- **Never invent an answer.** Skipped questions come back marked as skips, with an explicit
  instruction not to fill in the blank. A skip means "no answer", not "assume something".

[`pi-ask-user`](https://www.npmjs.com/package/pi-ask-user) takes the opposite position: it
ships a skill that *requires* the agent to stop and ask at high-stakes decision points. Both
are defensible. If being interrupted too much is your problem, this is the one you want.

The exact guidelines, verbatim:

> - Batch every question you need into a single `ask_user` call; the user answers them in sequence.
> - Ask only when you truly cannot proceed. Never ask what you can read from the repo, infer, or decide yourself.
> - State an assumption and continue instead of asking.
> - Phrase each question to be answerable in one typed sentence — the user types text, they do not pick from options.
> - A skipped question means the user declined to answer. Never fabricate an answer; re-ask or proceed without it.

## Install

```bash
# from npm
pi install npm:pi-ask-user-questions

# from git
pi install git:github.com/qunm00/pi-ask-user-questions@v1

# try it for one run without saving
pi -e npm:pi-ask-user-questions
```

Then enable the tool in a session if it is not already active:

```
/tools
```

## How it behaves

- **One dialog at a time**, titled `Question 2 of 3: <the question>`. Questions are asked
  and answered in the order given.
- **Enter** submits. **Escape** skips that one question and moves to the next — you keep
  your momentum instead of restarting the batch.
- Submitting an empty answer re-prompts once, because a stray Enter is usually an accident.
  Press Escape at the re-prompt to skip.
- Skipped questions are reported to the model explicitly, with an instruction not to invent
  an answer.
- Batching holds even when the agent is careless: the tool is registered with
  `executionMode: "sequential"`, so three separate `ask_user` calls in one assistant message
  queue instead of stacking.

## Limitations

These are deliberate, not oversights:

- **Single-line answers.** `ui.editor()` accepts no `AbortSignal`, so aborting a turn while
  a multiline dialog is open would leave the dialog waiting and the turn unable to finish.
  Single-line input is abort-safe. Pasted multi-line text is preserved, but you cannot type
  a newline mid-answer.
- **No `placeholder` support.** In pi 0.87.1 the `ui.input` placeholder argument is taken by
  `ExtensionInputComponent` as `_placeholder` and never read. There is nowhere to put an
  example answer, so put any needed guidance in the question text.
- **No timeout.** If the agent asks and you walk away, the dialog waits. Press Escape to skip.
- **Needs an interactive session.** In `print`/`json` mode there is no UI; the tool returns
  a message telling the model to ask in plain text instead of failing the turn.

## Development

```bash
npm install
npm test          # 27 tests, includes a real npm pack + install + load check
npm run test:unit # skips the slow sandbox install check
npm run typecheck # tsc --noEmit

# load it into a live pi without installing
pi -e ./extensions/ask-user.ts

# then, in that session:
/ask-demo
```

`/ask-demo` exercises the real dialog path without involving a model, so you can check
rendering and the skip/empty behaviour by hand.

Tests run on [`@marcfargas/pi-test-harness`](https://github.com/marcfargas/pi-test-harness),
which keeps pi real — real extension loading, real hooks, real tool registry — and
substitutes only the model boundary (`streamFn`) and `ctx.ui.*`.

That harness targets pi 0.75.x. Three things moved by 0.87 and are bridged in
`__tests__/support/pi-compat.ts` and `vitest.config.ts`; the comments there explain each
one. Remove those shims once a harness release supports 0.87.

Because the harness substitutes `ctx.ui.*`, **no automated test can check terminal
rendering**. `/ask-demo` is the manual gate for that.

## License

MIT
