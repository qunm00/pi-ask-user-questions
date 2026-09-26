/**
 * Publish verification: the tarball a consumer actually gets.
 *
 * Runs `npm pack`, installs the result into a sandbox, and loads it, asserting
 * the package's declared resources really arrive. This is the check that would
 * have caught a bad `files` allowlist, a wrong `pi` manifest path, or a missing
 * runtime dependency.
 *
 * Slow (~8s) because it shells out to npm twice. Kept in its own file so it can
 * be skipped for a fast inner loop: `npm run test:unit`.
 */

import { describe, it, expect } from "vitest";
import { verifySandboxInstall } from "@marcfargas/pi-test-harness";
import { fileURLToPath } from "node:url";

const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));

describe("package", () => {
	it(
		"packs, installs and loads with the ask_user tool available",
		async () => {
			const result = await verifySandboxInstall({
				packageDir: PACKAGE_DIR,
				expect: { extensions: 1, tools: ["ask_user"], skills: 0 },
			});

			// The extension must load in a clean environment with no error.
			expect(result.loaded.extensionErrors).toEqual([]);
			expect(result.loaded.extensions).toBe(1);
			expect(result.loaded.tools).toContain("ask_user");
		},
		300_000,
	);
});
