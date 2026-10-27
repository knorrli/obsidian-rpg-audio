import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";

// The obsidian package ships type definitions only, so tests resolve it to a small stub.
export default defineConfig({
	resolve: {
		alias: {obsidian: fileURLToPath(new URL("./tests/obsidian-stub.ts", import.meta.url))},
	},
});
