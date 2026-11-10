import type { MenuConfig, MenuMode, SupportedOS } from "./types.ts";

export function menuConfigWithDefaults(
	config?: Partial<MenuConfig>,
): MenuConfig {
	return {
		macos: { mode: "native", ...config?.macos },
		linux: { mode: "webview", ...config?.linux },
		win: { mode: "webview", ...config?.win },
	};
}

export function resolveMenuMode(
	os: SupportedOS,
	config?: Partial<MenuConfig>,
): MenuMode {
	return menuConfigWithDefaults(config)[os].mode;
}

export function isMenuMode(value: unknown): value is MenuMode {
	return (
		value === "native" ||
		value === "webview" ||
		value === "both" ||
		value === "none"
	);
}
