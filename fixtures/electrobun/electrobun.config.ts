import type { ElectrobunConfig } from "electrobun";
import workspace from "../../package.json";

export default {
	app: {
		name: "electrobun-fixture",
		identifier: "dev.electrobun-menu.electrobun-fixture",
		version: workspace.version,
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		copy: {
			"dist/index.html": "views/mainview/index.html",
			"dist/assets": "views/mainview/assets",
		},
		watchIgnore: ["dist/**"],
		mac: {
			codesign: false,
			notarize: false,
			bundleCEF: false,
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
