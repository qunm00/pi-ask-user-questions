import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
	resolve: {
		alias: {
			/**
			 * Compatibility shim for @marcfargas/pi-test-harness.
			 *
			 * The harness is built against pi 0.75.x and imports `getModel`
			 * from "@earendil-works/pi-ai". In 0.87 that legacy name moved
			 * to the documented compat entrypoint, whose own docblock says:
			 *
			 *   "Existing apps switch imports from '@earendil-works/pi-ai'
			 *    to '@earendil-works/pi-ai/compat' unchanged."
			 *
			 * `compat` re-exports the whole main entry plus the legacy
			 * aliases, so it is a strict superset (122 vs 68 exports). This
			 * alias remaps the harness's import without patching
			 * node_modules and without forking the harness.
			 *
			 * Caveat: the compat module is documented as temporary — "This
			 * module is deleted with the coding-agent ModelManager
			 * migration." Remove this alias once the harness imports
			 * `createModels()` directly, or once an upstream release
			 * supports 0.87.
			 */
			"@earendil-works/pi-ai": fileURLToPath(
				new URL("./node_modules/@earendil-works/pi-ai/dist/compat.js", import.meta.url),
			),
		},
	},
	test: {
		include: ["__tests__/**/*.test.ts"],
		// Session startup touches real pi internals; keep a ceiling so a
		// regression fails fast instead of hanging CI.
		testTimeout: 30_000,
		env: {
			/**
			 * The harness hardcodes `getModel("openai", "gpt-4o")` and patches
			 * auth by private field name (`session._modelRegistry`), which 0.87
			 * no longer exposes — so the auth check falls through to the real
			 * one. A dummy key satisfies it. The value is never transmitted:
			 * the playbook replaces the model's stream function, so no request
			 * is ever made.
			 */
			OPENAI_API_KEY: "test-dummy-key-not-a-real-credential",
		},
		server: {
			deps: {
				/**
				 * Required for the compat alias above to have any effect.
				 *
				 * Vitest externalizes node_modules deps by default and loads
				 * them with native Node ESM, which bypasses vite resolution
				 * entirely — so `resolve.alias` silently does nothing and the
				 * harness hits the missing `getModel`. Inlining the harness
				 * routes it through vite's transform, where the alias applies.
				 *
				 * Pi's own packages are deliberately NOT inlined: they must
				 * stay external so there is exactly one module instance and
				 * the harness interoperates with the same runtime pi uses.
				 */
				inline: ["@marcfargas/pi-test-harness"],
			},
		},
	},
});
