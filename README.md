# pi-ask-user

Let the agent **ask you a question and type the answer**. No multiple choice, no option
lists — just a question and a place to type. When the agent has several questions, you
answer them **one after another** in a single run.

Built for the case where you want to be consulted, not interrogated: the extension ships
guidelines that keep the agent from asking what it could work out on its own.

## Install

```bash
# from npm
pi install npm:pi-ask-user

# from git
pi install git:github.com/qunm00/pi-ask-user-questions@v1

# try it for one run without saving
pi -e npm:pi-ask-user
```

Then in a session:

```
/tools
```

and enable `ask_user` if it is not already active.

## How it behaves

- **One dialog at a time**, titled `Question 2 of 3: <the question>`. Questions are asked
  and answered in the order given.
- **Enter** submits. **Escape** skips that one question and moves to the next — you keep
  your momentum instead of restarting the batch.
- Submitting an empty answer re-prompts once, because a stray Enter is usually an accident.
  Press Escape at the re-prompt to skip.
- Skipped questions are reported to the model explicitly, with an instruction not to invent
  an answer. A skip always means "no answer", never "assume something".
- Batching is enforced by convention *and* by `executionMode: "sequential"`, so even if the
  agent asks three questions as three separate calls they queue instead of stacking.

## Rules given to the agent

While the tool is active, these are appended to the system prompt:

- Batch every question you need into a **single** `ask_user` call.
- Ask only when you truly cannot proceed. Never ask what you can read, infer, or decide.
- State an assumption and continue instead of asking.
- Phrase each question to be answerable in one typed sentence.
- A skipped question means declined. Never fabricate an answer.

## Limitations

These are deliberate, not oversights:

- **Single-line answers.** `ui.editor()` accepts no `AbortSignal`, so aborting a turn while
  a multiline dialog is open would leave the dialog waiting and the turn unable to finish.
  Single-line input is abort-safe. Pasted multi-line text is preserved, but you cannot type
  a newline mid-answer.
- **No `placeholder` support.** In pi 0.87.1 the `ui.input` placeholder argument is taken by
  `ExtensionInputComponent` as `_placeholder` and never read. There is nowhere to put an
  example answer, so put any needed guidance in the question text.
- **Needs an interactive session.** In `print`/`json` mode there is no UI; the tool returns
  a message telling the model to ask in plain text instead of failing the turn.

## Development

```bash
npm install
npm test          # 19 tests, includes a real npm pack + install + load check
npm run test:unit # skips the slow sandbox install check
npm run typecheck # tsc --noEmit

# load it into a live pi without installing
pi -e ./extensions/ask-user.ts

# then, in that session:
/ask-demo
```

`/ask-demo` exercises the real dialog path without involving a model, so you can check
rendering and the skip/empty behaviour by hand.

### Testing notes

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
