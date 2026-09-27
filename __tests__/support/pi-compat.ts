/**
 * Test support: bridge @marcfargas/pi-test-harness onto pi 0.87.x.
 *
 * The harness targets pi 0.75.x. Two things moved by 0.87. Both are handled
 * here rather than by forking the harness or patching node_modules.
 *
 * ---------------------------------------------------------------------------
 * 1. `agent.streamFn` -> `agent.streamFunction`   (handled in `createSession`)
 *
 *    The harness injects the model-substituting playbook with:
 *
 *        (session.agent as any).streamFn = streamFn;
 *
 *    In 0.87 the agent reads `agent.streamFunction` instead. The property was
 *    renamed, so the harness's assignment creates a dead, unread property and
 *    the real stream function is left in place — which then attempts a real
 *    network call. Symptom: "Playbook not fully consumed", 0 actions consumed.
 *
 *    `streamFunction` is a plain writable own data property (verified), so we
 *    install `streamFn` as an accessor that forwards to it.
 *
 * 2. `getModel` missing from pi-ai            (handled in vitest.config.ts)
 *
 *    Routed to the documented `@earendil-works/pi-ai/compat` entrypoint.
 *
 * ---------------------------------------------------------------------------
 * Upstream: this shim should be deleted once a harness release supports 0.87.
 * It is a compatibility layer against a moving target, so keep it in one place
 * and re-verify it whenever pi is upgraded.
 */

import { fileURLToPath } from "node:url";
import { createTestSession, type TestSession } from "@marcfargas/pi-test-harness";

export const EXTENSION = fileURLToPath(new URL("../../extensions/ask-user.ts", import.meta.url));

/**
 * Install the `streamFn` -> `streamFunction` forwarder on an agent.
 * Idempotent, so it is safe to call on a reused session.
 */
export function bridgeStreamFn(agent: unknown): void {
	const target = agent as Record<string, unknown>;
	if (!("streamFunction" in target)) {
		throw new Error(
			"bridgeStreamFn: agent has no `streamFunction` — pi's agent API changed again. " +
				"Re-check @marcfargas/pi-test-harness's streamFn injection point.",
		);
	}
	if (Object.getOwnPropertyDescriptor(target, "streamFn")?.get) return;

	Object.defineProperty(target, "streamFn", {
		configurable: true,
		enumerable: false,
		get: () => target.streamFunction,
		set: (value: unknown) => {
			target.streamFunction = value;
		},
	});
}

/**
 * Drop-in replacement for the harness's `createTestSession` with the pi 0.87
 * bridge applied. Options pass straight through; the bridge is applied
 * unconditionally so no test can accidentally skip it.
 *
 * Note: `mockTools` interception is NOT bridged — it is broken against 0.87
 * and irrelevant to ask_user, which calls no built-in tools. See the
 * module comment above.
 */
export async function createSession(options: Parameters<typeof createTestSession>[0] = {}): Promise<TestSession> {
	const session = await createTestSession(options);
	bridgeStreamFn((session.session as unknown as { agent: unknown }).agent);
	return session;
}

/** Convenience: a session with the ask_user extension loaded. */
export async function createAskUserSession(
	options: Parameters<typeof createTestSession>[0] = {},
): Promise<TestSession> {
	return createSession({ extensions: [EXTENSION], ...options });
}
