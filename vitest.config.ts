import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.base.ts";

export default mergeConfig(
	baseConfig,
	defineConfig({
		test: {
			coverage: {
				provider: "v8",
			},
			include: ["src/**/*.{test,spec}.{js,ts}"],
		},
	}),
);
