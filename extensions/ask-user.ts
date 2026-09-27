/**
 * ask_user — ask the user a question, get a typed free-form answer.
 *
 * The agent calls this tool; the user answers by typing. There are no options
 * to pick from. When several questions are needed, the user answers them one
 * after another in a single run.
 *
 * Design notes worth keeping:
 *
 *  - `executionMode: "sequential"` is load-bearing. Tool calls from one
 *    assistant message can otherwise run in parallel, and pi renders dialogs
 *    into a single shared editor container — two concurrent dialogs collide.
 *    Sequential also means that when the agent asks three questions as three
 *    separate calls, they queue instead of stacking.
 *
 *  - The dialog title is the ONLY channel that renders. In pi 0.87.1
 *    `ui.input`'s second argument is taken by `ExtensionInputComponent` as
 *    `_placeholder` and never read, so it is a silent no-op. We therefore put
 *    the question, the progress counter and any hint all in the title, and
 *    deliberately expose no `placeholder` parameter to the model.
 *
 *  - `ui.editor()` (multiline) is intentionally NOT used. Unlike `ui.input`,
 *    it accepts no AbortSignal, so aborting a turn while a multiline dialog is
 *    open leaves the dialog waiting and the turn unable to finish. Single-line
 *    input is abort-safe. Multiline is a possible follow-up once that path
 *    can be made cancellable.
 *
 *  - `promptGuidelines` do the real work of stopping the agent pestering the
 *    user: batch into one call, don't ask what you can determine yourself, and
 *    never invent an answer.
 */

import { Type } from "typebox";
import { defineTool, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";

interface AskQuestion {
	question: string;
	hint?: string;
}

interface AskAnswer {
	question: string;
	hint?: string;
	answer: string;
	skipped: boolean;
}

interface AskDetails {
	answers: AskAnswer[];
	/** True when an abort signal stopped the batch before every question was shown. */
	aborted: boolean;
}

const MAX_QUESTIONS = 10;

/**
 * Build the dialog title. This is the only text the user actually sees, so it
 * carries the counter, the question and the hint. `Text` wraps, so length is
 * not a problem.
 */
function formatTitle(index: number, total: number, question: AskQuestion, note?: string): string {
	const position = `Question ${index + 1} of ${total}`;
	const prefix = note ? `${position} — ${note}` : position;
	return `${prefix}: ${question.question}${question.hint ? ` (${question.hint})` : ""}`;
}

/**
 * Ask each question in order, one dialog at a time. Never returns until every
 * question is answered, skipped, or the turn is aborted.
 */
async function askQuestions(
	ctx: ExtensionContext,
	questions: AskQuestion[],
	signal: AbortSignal | undefined,
): Promise<AskDetails> {
	const answers: AskAnswer[] = [];
	let aborted = false;

	for (const [index, question] of questions.entries()) {
		if (signal?.aborted) {
			aborted = true;
			break;
		}

		let answer = await ctx.ui.input(formatTitle(index, questions.length, question), undefined, { signal });

		if (signal?.aborted) {
			aborted = true;
			break;
		}

		// An accidental Enter is likelier than a deliberate blank answer, so
		// confirm once before recording it as a skip. Escape skips immediately.
		if (answer !== undefined && answer.trim() === "") {
			answer = await ctx.ui.input(
				formatTitle(index, questions.length, question, "empty, Escape to skip"),
				undefined,
				{ signal },
			);
			if (signal?.aborted) {
				aborted = true;
				break;
			}
		}

		const text = answer ?? "";
		const skipped = text.trim() === "";
		answers.push({
			question: question.question,
			hint: question.hint,
			answer: skipped ? "" : text,
			skipped,
		});
	}

	return { answers, aborted };
}

/** Model-facing transcript. Explicit about skips so nothing gets invented. */
function buildContent(details: AskDetails, requested: number): string {
	const lines: string[] = [];

	for (const [index, entry] of details.answers.entries()) {
		lines.push(`Q${index + 1}: ${entry.question}`);
		lines.push(`A${index + 1}: ${entry.skipped ? "(skipped — the user did not answer)" : entry.answer}`);
		lines.push("");
	}

	if (details.answers.length === 0) {
		lines.push("The user did not answer any question.");
	}

	const skipped = details.answers.filter((entry) => entry.skipped).length;
	if (skipped > 0) {
		lines.push(
			`${skipped} of ${requested} question(s) went unanswered. Do not fabricate an answer — ` +
				`either re-ask ${skipped === 1 ? "it" : "them"} or proceed without ${skipped === 1 ? "it" : "them"}.`,
		);
	}

	const unanswered = requested - details.answers.length;
	if (details.aborted) {
		// Wording is deliberately about *answered*, not *shown*. An aborted
		// dialog may have been on screen, so claiming it was never shown could
		// be false; "did not get answered" is always true.
		lines.push(
			`The turn was interrupted after ${details.answers.length} of ${requested} question(s). ` +
				"Do not assume answers to the ${unanswered} that were not answered.",
		);
	}

	return lines.join("\n").trimEnd();
}

const askUserTool = defineTool({
	name: "ask_user",
	label: "Ask User",
	description:
		"Ask the user a question and read back the answer they type. The user types free-form text — " +
		"there is no list of options to choose from, so phrase each question so it can be answered in " +
		"a sentence. Put every question you need into a single call; the user answers them in sequence. " +
		"Use this only when you genuinely cannot proceed: never ask what you can read from the repo, " +
		"infer, or decide yourself. If a question comes back skipped, the user declined to answer it — " +
		"never invent an answer for it.",
	promptSnippet: "Ask the user a question and read their typed free-form answer",
	promptGuidelines: [
		"Batch every question you need into a single ask_user call; the user answers them in sequence.",
		"Ask only when you truly cannot proceed. Never ask what you can read from the repo, infer, or decide yourself.",
		"State an assumption and continue instead of asking.",
		"Phrase each question to be answerable in one typed sentence — the user types text, they do not pick from options.",
		"A skipped question means the user declined to answer. Never fabricate an answer; re-ask or proceed without it.",
	],
	parameters: Type.Object({
		questions: Type.Array(
			Type.Object({
				question: Type.String({
					description: "The question to ask, phrased so it can be answered in one typed sentence.",
				}),
				hint: Type.Optional(
					Type.String({
						description: "Optional short context for why you are asking, shown with the question.",
					}),
				),
			}),
			{
				minItems: 1,
				maxItems: MAX_QUESTIONS,
				description: "Every question you need answered, asked and answered in this order.",
			},
		),
	}),
	executionMode: "sequential",
	async execute(_toolCallId, params, signal, _onUpdate, ctx) {
		if (!ctx.hasUI) {
			return {
				content: [
					{
						type: "text",
						text:
							"ask_user needs an interactive session and this run has no UI. " +
							"Ask the user directly in plain text instead of calling this tool.",
					},
				],
				details: { answers: [], aborted: false } as AskDetails,
			};
		}

		const details = await askQuestions(ctx, params.questions, signal);
		return {
			content: [{ type: "text", text: buildContent(details, params.questions.length) }],
			details,
		};
	},
});

/** Questions used by /ask-demo to exercise the dialogs without a model. */
const DEMO_QUESTIONS: AskQuestion[] = [
	{ question: "What should I call you?", hint: "used in the greeting" },
	{ question: "What are we working on today?" },
];

export default function (pi: ExtensionAPI) {
	pi.registerTool(askUserTool);

	pi.registerCommand("ask-demo", {
		description: "Manually test the ask dialogs (same code path as ask_user)",
		handler: async (_args, ctx) => {
			ctx.ui.notify(`/ask-demo invoked (mode=${ctx.mode}, hasUI=${ctx.hasUI})`, "info");

			if (!ctx.hasUI) {
				ctx.ui.notify("ask-demo needs an interactive session. Drop --mode/--print.", "error");
				return;
			}

			const details = await askQuestions(ctx, DEMO_QUESTIONS, ctx.signal);

			for (const [index, entry] of details.answers.entries()) {
				ctx.ui.notify(
					`Q${index + 1}: ${entry.skipped ? "skipped (Escape)" : entry.answer}`,
					entry.skipped ? "warning" : "info",
				);
			}
			if (details.aborted) ctx.ui.notify("aborted before all questions were shown", "warning");
		},
	});
}
