/**
 * ask_user behaviour, driven through a real pi session.
 *
 * The harness substitutes only `ctx.ui.input`, so these tests exercise the
 * tool's real registration, real execution and real result plumbing. What
 * they cannot check is terminal rendering — that remains the human gate via
 * /ask-demo.
 *
 * Cancellation is simulated with `input: () => undefined`. Note that
 * `input: undefined` does NOT work: an explicit undefined is indistinguishable
 * from omitting the key, so the documented default `input -> ""` applies.
 */

import { calls, says, type TestSession, when } from "@marcfargas/pi-test-harness";
import { afterEach, describe, expect, it } from "vitest";
import { createAskUserSession } from "./support/pi-compat";

/** Runs one turn where the model calls ask_user, and returns the session. */
async function ask(
	questions: Array<{ question: string; hint?: string }>,
	input: (title: string) => string | undefined,
): Promise<TestSession> {
	const t = await createAskUserSession({ mockUI: { input } } as never);
	await t.run(when("I need some input from you", [calls("ask_user", { questions }), says("Thanks.")]));
	return t;
}

/** Build a responder keyed by a substring of the dialog title. */
function byQuestion(responses: Record<string, (title: string) => string | undefined>) {
	return (title: string): string | undefined => {
		for (const [key, respond] of Object.entries(responses)) {
			if (title.includes(key)) return respond(title);
		}
		throw new Error(`no responder registered for dialog: ${title}`);
	};
}

describe("ask_user", () => {
	let t: TestSession | undefined;
	afterEach(() => t?.dispose());

	it("is registered as a tool", async () => {
		t = await createAskUserSession();
		const names = (t.session.getAllTools?.() ?? []).map((tool: { name: string }) => tool.name);
		expect(names).toContain("ask_user");
	});

	it("returns the typed answer to the model", async () => {
		t = await ask([{ question: "What should I call you?" }], () => "Alice");

		const result = t.events.toolResultsFor("ask_user")[0];
		expect(result.isError).toBe(false);
		expect(result.text).toContain("Q1: What should I call you?");
		expect(result.text).toContain("A1: Alice");
	});

	it("asks a batch consecutively, in order", async () => {
		const titles: string[] = [];
		t = await ask(
			[{ question: "What should I call you?" }, { question: "What are we working on?" }, { question: "Any deadline?" }],
			(title) => {
				titles.push(title);
				return `answer ${titles.length}`;
			},
		);

		expect(titles).toHaveLength(3);
		// Sequential, never concurrent, and each names its position.
		expect(titles[0]).toContain("Question 1 of 3");
		expect(titles[1]).toContain("Question 2 of 3");
		expect(titles[2]).toContain("Question 3 of 3");

		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("A1: answer 1");
		expect(text).toContain("A2: answer 2");
		expect(text).toContain("A3: answer 3");
	});

	it("shows the question text and the hint in the title", async () => {
		t = await ask([{ question: "What should I call you?", hint: "used in the greeting" }], () => "Alice");

		const title = t.events.uiCallsFor("input")[0].args[0] as string;
		expect(title).toContain("What should I call you?");
		expect(title).toContain("used in the greeting");
	});

	it("Escape skips only that question and continues the batch", async () => {
		const titles: string[] = [];
		t = await ask([{ question: "First question?" }, { question: "Second question?" }], (title) => {
			titles.push(title);
			// Skip the first, answer the second.
			return title.includes("First") ? undefined : "answered anyway";
		});

		expect(titles).toHaveLength(2);
		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("A1: (skipped — the user did not answer)");
		expect(text).toContain("A2: answered anyway");
	});

	it("tells the model not to fabricate a skipped answer", async () => {
		t = await ask([{ question: "Secret question?" }], () => undefined);

		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("1 of 1 question(s) went unanswered");
		expect(text).toContain("Do not fabricate an answer");
	});

	it("re-prompts once on an empty answer, then records it if retyped", async () => {
		t = await ask([{ question: "Name?" }], (title) => (title.includes("empty, Escape to skip") ? "retyped" : ""));

		expect(t.events.uiCallsFor("input")).toHaveLength(2);
		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("A1: retyped");
		expect(text).not.toContain("skipped");
	});

	it("skips after the empty re-prompt is also left blank", async () => {
		t = await ask([{ question: "Name?" }], () => "");

		// Two dialogs: the question, then the "empty, Escape to skip" re-prompt.
		expect(t.events.uiCallsFor("input")).toHaveLength(2);
		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("A1: (skipped — the user did not answer)");
	});

	it("does not re-prompt when the user presses Escape", async () => {
		t = await ask([{ question: "Name?" }], () => undefined);

		// Escape skips immediately — exactly one dialog.
		expect(t.events.uiCallsFor("input")).toHaveLength(1);
	});

	it("preserves a whitespace-only answer as skipped, not as content", async () => {
		t = await ask([{ question: "Name?" }], byQuestion({ Name: () => "   " }));

		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("A1: (skipped — the user did not answer)");
	});

	it("keeps multi-line typed text intact", async () => {
		t = await ask([{ question: "Paste the config?" }], () => "line one\nline two");

		const text = t.events.toolResultsFor("ask_user")[0].text;
		expect(text).toContain("line one");
		expect(text).toContain("line two");
	});
});
