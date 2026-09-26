/**
 * ask_user — Step 1 spike
 *
 * Verifies the one thing that cannot be proven from source: whether a
 * free-form input dialog renders correctly while a session is active.
 * `withUIPrompt()` only emits events; it does not suspend the agent stream.
 *
 * Run:  pi -e ./extensions/ask-user.ts
 * Then: /ask-demo
 *
 * This file is deliberately minimal. The real `ask_user` tool is Step 2 and
 * only gets written once this spike passes.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface DemoQuestion {
	question: string;
	/**
	 * Unused in pi 0.87.1 — `ui.input`'s placeholder argument is ignored by
	 * `ExtensionInputComponent`. Kept here to document the dead channel, and
	 * to remind us that any example answer has to go in the question text.
	 */
	placeholder?: string;
}

const DEMO_QUESTIONS: DemoQuestion[] = [
	{ question: "What should I call you?", placeholder: "your name" },
	{ question: "What are we working on today?", placeholder: "a short description" },
];

export default function (pi: ExtensionAPI) {
	// Diagnostic: announce on load so it is obvious whether the extension
	// actually loaded in this session, without having to guess from
	// autocomplete. Also surfaces the mode and hasUI values that gate the
	// dialog below.
	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.notify(
			`ask_user spike loaded (mode=${ctx.mode}, hasUI=${ctx.hasUI}) — type /ask-demo`,
			"info",
		);
	});

	pi.registerCommand("ask-demo", {
		description: "Spike: ask 2 free-form questions consecutively and echo the answers",
		handler: async (_args, ctx) => {
			// Report before any early return, so a silent no-op is explainable.
			ctx.ui.notify(
				`/ask-demo invoked (mode=${ctx.mode}, hasUI=${ctx.hasUI}) — opening dialog 1…`,
				"info",
			);

			if (!ctx.hasUI) {
				ctx.ui.notify(
					"ask-demo needs an interactive session (hasUI is false). " +
						"Not running in the TUI? Use `pi` with no --mode/--print flag.",
					"error",
				);
				return;
			}

			const answers: Array<string | undefined> = [];

			// The question text must go in the `title`.
			//
			// Two reasons, both learned the hard way:
			//  1. `ExtensionInputComponent` takes the 2nd param as `_placeholder`
			//     and never reads it, so `ui.input(title, placeholder)` silently
			//     discards the placeholder in pi 0.87.1. The title is the only
			//     channel that actually renders.
			//  2. The counter alone tells the user nothing about what is being
			//     asked, so it must be combined with the question.
			//
			// `Text` wraps, so a long question is fine.
			for (const [index, item] of DEMO_QUESTIONS.entries()) {
				const title = `Question ${index + 1} of ${DEMO_QUESTIONS.length}: ${item.question}`;
				answers.push(await ctx.ui.input(title));
			}

			for (const [index, answer] of answers.entries()) {
				const label = `Q${index + 1}`;
				if (answer === undefined) {
					ctx.ui.notify(`${label}: skipped (Escape)`, "warning");
				} else if (answer.trim() === "") {
					ctx.ui.notify(`${label}: empty answer (not yet guarded)`, "warning");
				} else {
					ctx.ui.notify(`${label}: ${answer}`, "info");
				}
			}

			ctx.ui.notify("Spike complete — if you saw both dialogs, Step 1 passes.", "info");
		},
	});
}
