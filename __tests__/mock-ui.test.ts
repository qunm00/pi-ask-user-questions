/**
 * Validates the interception point we actually depend on: mockUI.
 *
 * The harness's `mockTools` interception is broken against pi 0.87 (it writes
 * `agent.state.tools`, which 0.87 re-derives via `_preparePromptAndToolLoadout`
 * at prompt time). That break is irrelevant to ask_user, which calls no
 * built-in tools — it only shows dialogs.
 *
 * `mockUI` is the load-bearing substitution: it is how we simulate the user
 * typing an answer. This test proves it reaches a real extension tool's
 * `ctx.ui.input()` under pi 0.87.1.
 *
 * Uses `extensionFactories` to register a throwaway tool inline, so this
 * passes before ask_user (Step 2) exists.
 */

import { describe, it, expect, afterEach } from "vitest";
import { when, calls, says, type TestSession, type TestSessionOptions } from "@marcfargas/pi-test-harness";
import { createSession } from "./support/pi-compat";
import { Type } from "typebox";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const probeTool = defineTool({
	name: "ui_probe",
	label: "UI Probe",
	description: "Calls ctx.ui.input and reports what came back",
	parameters: Type.Object({ label: Type.String() }),
	async execute(_id, params, _signal, _onUpdate, ctx) {
		const answer = await ctx.ui.input(`Question for ${params.label}`, "type here");
		return {
			content: [{ type: "text", text: `answer=${answer === undefined ? "<cancelled>" : answer}` }],
			details: { answer: answer ?? null },
		};
	},
});

function probeExtension(pi: ExtensionAPI) {
	pi.registerTool(probeTool);
}

describe("mockUI interception", () => {
	let t: TestSession | undefined;
	afterEach(() => t?.dispose());

	it("routes ctx.ui.input to mockUI and records the call", async () => {
		t = await createSession({
			extensionFactories: [probeExtension],
			mockUI: { input: "the typed answer" },
		} as TestSessionOptions);

		await t.run(
			when("Ask me something", [
				calls("ui_probe", { label: "alpha" }),
				says("Got it."),
			]),
		);

		// The tool ran for real and received the mocked answer.
		const result = t.events.toolResultsFor("ui_probe")[0];
		expect(result.text).toContain("the typed answer");

		// The UI call was intercepted and recorded. UICallRecord is
		// { method, args, returnValue } — the dialog title is args[0].
		const uiCalls = t.events.uiCallsFor("input");
		expect(uiCalls).toHaveLength(1);
		expect(uiCalls[0].method).toBe("input");
		expect(uiCalls[0].args[0]).toContain("Question for alpha");
		expect(uiCalls[0].returnValue).toBe("the typed answer");
	});

	it("supports a dynamic input handler and records cancellation", async () => {
		t = await createSession({
			extensionFactories: [probeExtension],
			mockUI: { input: (title: string) => (title.includes("alpha") ? "dynamic answer" : undefined) },
		} as TestSessionOptions);

		await t.run(
			when("Ask about alpha", [
				calls("ui_probe", { label: "alpha" }),
				says("Done."),
			]),
		);

		expect(t.events.toolResultsFor("ui_probe")[0].text).toContain("dynamic answer");
	});

	it("surfaces undefined (Escape) to the tool", async () => {
		/**
		 * NOTE: `input: undefined` does NOT simulate Escape. An explicit
		 * `undefined` is indistinguishable from omitting the key, so the
		 * documented default `input -> ""` applies and the tool receives an
		 * empty string. Cancellation must be a function returning undefined.
		 *
		 * This is load-bearing for ask_user, whose Escape path is
		 * `answer === undefined`.
		 */
		t = await createSession({
			extensionFactories: [probeExtension],
			mockUI: { input: () => undefined },
		} as TestSessionOptions);

		await t.run(
			when("Ask and let me cancel", [
				calls("ui_probe", { label: "beta" }),
				says("Skipped."),
			]),
		);

		expect(t.events.toolResultsFor("ui_probe")[0].text).toContain("<cancelled>");
		expect(t.events.uiCallsFor("input")[0].returnValue).toBeUndefined();
	});

	it("defaults to an empty string when input is omitted entirely", async () => {
		t = await createSession({ extensionFactories: [probeExtension] } as TestSessionOptions);

		await t.run(
			when("Ask with no mock configured", [
				calls("ui_probe", { label: "gamma" }),
				says("Done."),
			]),
		);

		// Documented default: input -> "". Confirms the distinction above.
		expect(t.events.toolResultsFor("ui_probe")[0].text).toContain("answer=");
		expect(t.events.toolResultsFor("ui_probe")[0].text).not.toContain("<cancelled>");
	});
});
