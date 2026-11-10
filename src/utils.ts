import { platform } from "node:os";

export const OS = (() => {
	switch (platform()) {
		case "darwin":
			return "macos";
		case "win32":
			return "win";
		case "linux":
			return "linux";
		default:
			throw new Error(`Unsupported platform: ${platform()}`);
	}
})();
