/**
 * Smoke test: prove the harness drives a real pi 0.87.1 session with our
 * extension loaded.
 *
 * This validates the *toolchain* (harness + compat alias + streamFn bridge),
 * not any ask_user behaviour yet — the tool is Step 2. It is the regression
 * guard for the pi 0.77 breaks documented in support/pi-compat.ts.
 *
 * Note: the harness substitutes `ctx.ui.*`, so no test here can validate
 * terminal rendering. The human gate (pi -e ./extensions/ask-user.ts, then
 * /ask-demo) remains the only check for that.
 */

import { says, type TestSession, when } from "@marcfargas/pi-test-harness";
import { afterEach, describe, expect, it } from "vitest";
import { createAskUserSession } from "./support/pi-compat";

describe("toolchain", () => {
	let t: TestSession | undefined;

	afterEach(() => t?.dispose());

	it("consumes a playbook turn, proving the streamFn bridge works", async () => {
		t = await createAskUserSession();

		await t.run(when("Say hello", [says("Hello from the playbook.")]));

		// playbook.remaining is a count, not a list. The harness also
		// self-asserts consumption, so run() resolving already proves the
		// streamFn bridge injected the playbook.
		expect(t.playbook.consumed).toBe(1);
		expect(t.playbook.remaining).toBe(0);
	});

	it("loads our extension without extension errors", async () => {
		t = await createAskUserSession();
		const errors = t.session.extensionsResult?.extensionErrors ?? [];
		expect(errors).toEqual([]);
	});

	it("registers ask_user", async () => {
		t = await createAskUserSession();
		const names = (t.session.getAllTools?.() ?? []).map((tool: { name: string }) => tool.name);
		expect(names).toContain("ask_user");
	});
});
