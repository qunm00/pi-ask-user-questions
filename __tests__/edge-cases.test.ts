/**
 * Edge cases: abort handling, the no-UI path, and the serialisation guarantee.
 *
 * These call the registered tool's `execute()` directly with a crafted context
 * and signal, because the harness's playbook cannot express them: it emits one
 * tool call per assistant message and never aborts a turn mid-flight.
 *
 * What still needs a live session, and why:
 *
 *  - Three separate `ask_user` calls in one assistant message. Structurally
 *    unreachable via the playbook, which emits a single tool call per message.
 *    What IS asserted here is the mechanism that makes it safe: the tool is
 *    registered with `executionMode: "sequential"`.
 *  - A real terminal abort (Esc / Ctrl+C) while a dialog is on screen. The
 *    abort propagation below is unit-tested against a real AbortSignal, but
 *    only a terminal can confirm the TUI dismisses the dialog cleanly.
 */

import type { TestSession } from "@marcfargas/pi-test-harness";
import { afterEach, describe, expect, it } from "vitest";
import { createAskUserSession } from "./support/pi-compat";

interface AskResult {
	content: Array<{ type: string; text: string }>;
	details: { answers: Array<{ skipped: boolean }>; aborted: boolean };
}

type ToolDef = {
	executionMode?: string;
	execute: (
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: undefined,
		ctx: unknown,
	) => Promise<AskResult>;
};

/** Load the real registered tool definition out of a live session. */
async function loadTool(): Promise<{ t: TestSession; tool: ToolDef }> {
	const t = await createAskUserSession();
	const tool = (t.session as unknown as { getToolDefinition(name: string): ToolDef }).getToolDefinition("ask_user");
	return { t, tool };
}

function fakeCtx(overrides: Record<string, unknown> = {}) {
	return { hasUI: true, mode: "tui", ...overrides };
}

describe("ask_user edge cases", () => {
	let t: TestSession | undefined;
	afterEach(() => t?.dispose());

	it("is registered as sequential, which is what stops dialogs stacking", async () => {
		const loaded = await loadTool();
		t = loaded.t;
		expect(loaded.tool.executionMode).toBe("sequential");
	});

	it("opens no dialog and returns when the signal is already aborted", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		const dialogs: string[] = [];
		const controller = new AbortController();
		controller.abort();

		const result = await tool.execute(
			"call-1",
			{ questions: [{ question: "Q1?" }, { question: "Q2?" }] },
			controller.signal,
			undefined,
			fakeCtx({
				ui: {
					input: async (title: string) => {
						dialogs.push(title);
						return "x";
					},
				},
			}),
		);

		expect(dialogs).toHaveLength(0);
		expect(result.details.aborted).toBe(true);
		expect(result.content[0].text).toContain("interrupted after 0 of 2");
		// Assert the whole message, not just its first clause. A plain string
		// where a template literal was meant once shipped the literal text
		// "${unanswered}" to the model, and asserting only the first sentence
		// let it through.
		expect(result.content[0].text).toContain("Do not assume answers to the 2 that were not answered.");
		expect(result.content[0].text).not.toContain("${");
	});

	it("stops asking further questions once aborted mid-batch", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		const dialogs: string[] = [];
		const controller = new AbortController();

		// The user aborts while the first dialog is up.
		const result = await tool.execute(
			"call-2",
			{ questions: [{ question: "Q1?" }, { question: "Q2?" }, { question: "Q3?" }] },
			controller.signal,
			undefined,
			fakeCtx({
				ui: {
					input: async (title: string) => {
						dialogs.push(title);
						controller.abort();
						return undefined; // abort resolves the dialog as cancelled
					},
				},
			}),
		);

		// Only the first dialog opened, and no further questions were asked.
		expect(dialogs).toHaveLength(1);
		expect(dialogs[0]).toContain("Q1?");
		expect(result.details.aborted).toBe(true);
		expect(result.content[0].text).toContain("interrupted after 0 of 3");
		expect(result.content[0].text).toContain("Do not assume answers to the 3 that were not answered.");
		expect(result.content[0].text).not.toContain("${");
	});

	it("keeps answers already collected before the abort", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		const controller = new AbortController();
		let call = 0;

		const result = await tool.execute(
			"call-3",
			{ questions: [{ question: "Q1?" }, { question: "Q2?" }] },
			controller.signal,
			undefined,
			fakeCtx({
				ui: {
					input: async () => {
						call += 1;
						// Answer the first, then abort before the second is answered.
						if (call === 2) controller.abort();
						return "first answer";
					},
				},
			}),
		);

		expect(result.details.answers).toHaveLength(1);
		expect(result.details.answers[0].skipped).toBe(false);
		expect(result.details.aborted).toBe(true);
		expect(result.content[0].text).toContain("A1: first answer");
		expect(result.content[0].text).toContain("interrupted after 1 of 2");
		expect(result.content[0].text).toContain("Do not assume answers to the 1 that were not answered.");
		expect(result.content[0].text).not.toContain("${");
	});

	it("passes the abort signal through to each dialog", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		const seen: Array<AbortSignal | undefined> = [];
		const controller = new AbortController();

		await tool.execute(
			"call-4",
			{ questions: [{ question: "Q1?" }] },
			controller.signal,
			undefined,
			fakeCtx({
				ui: {
					input: async (_title: string, _placeholder: unknown, opts?: { signal?: AbortSignal }) => {
						seen.push(opts?.signal);
						return "ok";
					},
				},
			}),
		);

		// Without this, a terminal abort could not dismiss an open dialog.
		expect(seen).toHaveLength(1);
		expect(seen[0]).toBe(controller.signal);
	});

	it("returns an actionable message with no dialog in a session that has no UI", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		let dialogsOpened = 0;
		const result = await tool.execute(
			"call-5",
			{ questions: [{ question: "Q1?" }] },
			undefined,
			undefined,
			fakeCtx({
				hasUI: false,
				mode: "print",
				ui: {
					input: async () => {
						dialogsOpened += 1;
						return "should never happen";
					},
				},
			}),
		);

		// Must not hang, and must not pretend it got an answer.
		expect(dialogsOpened).toBe(0);
		expect(result.content[0].text).toContain("needs an interactive session");
		expect(result.content[0].text).toContain("plain text");
		expect(result.details.answers).toHaveLength(0);
	});

	it("tolerates a single question and a large batch", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		const single = await tool.execute(
			"call-6",
			{ questions: [{ question: "Only one?" }] },
			undefined,
			undefined,
			fakeCtx({ ui: { input: async () => "solo" } }),
		);
		expect(single.details.answers).toHaveLength(1);
		expect(single.details.aborted).toBe(false);

		const many = await tool.execute(
			"call-7",
			{ questions: Array.from({ length: 10 }, (_, i) => ({ question: `Q${i + 1}?` })) },
			undefined,
			undefined,
			fakeCtx({ ui: { input: async () => "answer" } }),
		);
		expect(many.details.answers).toHaveLength(10);
		expect(many.content[0].text).toContain("A10: answer");
	});

	/**
	 * Batch limits are declared in the TypeBox schema, which Pi validates
	 * against BEFORE `execute` is called. Calling `execute` directly bypasses
	 * that layer, so this asserts the declared contract rather than pretending
	 * to test the enforcement.
	 */
	it("declares a 1..10 question batch, with question required and hint optional", async () => {
		const { t: session, tool } = await loadTool();
		t = session;

		const schema = (tool as unknown as { parameters: { properties: { questions: Record<string, unknown> } } })
			.parameters.properties.questions;
		expect(schema.type).toBe("array");
		expect(schema.minItems).toBe(1);
		expect(schema.maxItems).toBe(10);

		const items = schema.items as { required: string[]; properties: Record<string, { type: string }> };
		expect(items.required).toEqual(["question"]);
		expect(items.properties.hint?.type).toBe("string");
	});
});
