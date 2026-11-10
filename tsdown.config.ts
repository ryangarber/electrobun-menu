import { defineConfig, type UserConfig } from "tsdown";

const baseConfig = {
	format: "esm",
	dts: true,
	treeshake: true,
	target: "es2024",
	fixedExtension: true,
	deps: {
		neverBundle: /^(electrobun|react|preact|solid-js|svelte|vue)(\/.*)?$/,
	},
} satisfies UserConfig;

export default defineConfig([
	{
		...baseConfig,
		entry: ["src/index.ts"],
		platform: "node",
	},
	{
		...baseConfig,
		entry: {
			menu: "src/menu.ts",
			react: "src/frameworks/react.ts",
			preact: "src/frameworks/preact.ts",
			solid: "src/frameworks/solid.ts",
			svelte: "src/frameworks/svelte.ts",
			vue: "src/frameworks/vue.ts",
		},
		platform: "browser",
	},
]);
