import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "../../vitest.config.base.ts";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite.ts";

export default mergeConfig(
	baseConfig,
	defineConfig({
		root: "src/mainview",
		input: "index.html",
		build: {
			emptyOutDir: true,
			outDir: "../../dist",
		},
		resolve: {
			alias: electrobunViteAliases(
				fileURLToPath(new URL("./.hutch/devkit", import.meta.url)),
			),
		},
	}),
);
