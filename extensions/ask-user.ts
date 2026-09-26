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
	placeholder?: string;
}

const DEMO_QUESTIONS: DemoQuestion[] = [
	{ question: "What should I call you?", placeholder: "your name" },
	{ question: "What are we working on today?", placeholder: "a short description" },
];

export default function (pi: ExtensionAPI) {
	pi.registerCommand("ask-demo", {
		description: "Spike: ask 2 free-form questions consecutively and echo the answers",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("ask-demo needs an interactive session (hasUI is false)", "error");
				return;
			}

			const answers: Array<string | undefined> = [];

			// Sequential by construction: each await completes before the next
			// dialog opens, so the two can never stack.
			for (const [index, item] of DEMO_QUESTIONS.entries()) {
				const title = `Question ${index + 1} of ${DEMO_QUESTIONS.length}`;
				answers.push(await ctx.ui.input(title, item.placeholder));
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
