import type {
	ApplicationMenuItemConfig,
	NormalMenuItemConfig,
	SerializedMenuItem,
	SupportedOS,
} from "./types.ts";

const roleLabels: Record<string, string> = {
	about: "About",
	quit: "Quit",
	hide: "Hide",
	hideOthers: "Hide Others",
	showAll: "Show All",
	minimize: "Minimize",
	zoom: "Zoom",
	close: "Close",
	bringAllToFront: "Bring All To Front",
	cycleThroughWindows: "Cycle Through Windows",
	enterFullScreen: "Enter Full Screen",
	exitFullScreen: "Exit Full Screen",
	toggleFullScreen: "Toggle Full Screen",
	appMenu: "App",
	undo: "Undo",
	redo: "Redo",
	cut: "Cut",
	copy: "Copy",
	paste: "Paste",
	pasteAndMatchStyle: "Paste and Match Style",
	delete: "Delete",
	selectAll: "Select All",
	startSpeaking: "Start Speaking",
	stopSpeaking: "Stop Speaking",
	showHelp: "Show Help",
};

const lowercaseWords = new Set(["and", "to", "of", "by", "in", "with"]);

/** Same labels Electrobun's `roleLabelMap` produces for a role without a label. */
export function roleLabel(role: string): string {
	const known = roleLabels[role];
	if (known) return known;
	return role
		.replace(/([a-z0-9])([A-Z])/g, "$1 $2")
		.split(" ")
		.map((word, index) => {
			const lower = word.toLowerCase();
			if (index > 0 && lowercaseWords.has(lower)) return lower;
			return word.charAt(0).toUpperCase() + word.slice(1);
		})
		.join(" ");
}

/** Roles a webview can perform itself, without the main process. */
export const webviewRoles = new Set([
	"undo",
	"redo",
	"cut",
	"copy",
	"paste",
	"pasteAndMatchStyle",
	"delete",
	"selectAll",
	"startSpeaking",
	"stopSpeaking",
]);

/** Display-only shortcuts native menus attach to edit roles. */
export function defaultRoleAccelerator(
	role: string,
	os: SupportedOS,
): string | undefined {
	switch (role) {
		case "undo":
			return "CmdOrCtrl+Z";
		case "redo":
			return os === "win" ? "CmdOrCtrl+Y" : "CmdOrCtrl+Shift+Z";
		case "cut":
			return "CmdOrCtrl+X";
		case "copy":
			return "CmdOrCtrl+C";
		case "paste":
			return "CmdOrCtrl+V";
		case "pasteAndMatchStyle":
			return os === "macos" ? "CmdOrCtrl+Alt+Shift+V" : "CmdOrCtrl+Shift+V";
		case "selectAll":
			return "CmdOrCtrl+A";
		default:
			return undefined;
	}
}

export function isDivider(
	item: ApplicationMenuItemConfig | SerializedMenuItem,
): item is { type: "divider" | "separator" } {
	return item.type === "divider" || item.type === "separator";
}

/** `&File` marks F as the access key; `&&` is a literal ampersand. */
export function parseMnemonic(label: string) {
	let text = "";
	let mnemonicIndex = -1;
	for (let i = 0; i < label.length; i++) {
		const char = label.charAt(i);
		if (char !== "&") {
			text += char;
			continue;
		}
		const next = label.charAt(i + 1);
		if (next === "&") {
			text += "&";
			i++;
		} else if (next && mnemonicIndex === -1) {
			mnemonicIndex = text.length;
		}
	}
	return { text, mnemonicIndex };
}

export function stripMnemonics(label: string): string {
	return parseMnemonic(label).text;
}

/** Drops dividers at either end of a menu and collapses repeated ones. */
export function tidyDividers<T extends ApplicationMenuItemConfig>(
	items: readonly T[],
): T[] {
	const result: T[] = [];
	for (const item of items) {
		if (isDivider(item) && (!result.length || isDivider(result.at(-1) as T)))
			continue;
		result.push(item);
	}
	while (result.length && isDivider(result.at(-1) as T)) result.pop();
	return result;
}

export function hasItems(items: readonly ApplicationMenuItemConfig[]): boolean {
	return items.some((item) => !isDivider(item));
}

export function itemRole(item: NormalMenuItemConfig): string | undefined {
	return "role" in item && item.role ? item.role : undefined;
}

export function itemAction(item: NormalMenuItemConfig): string | undefined {
	return "action" in item && item.action ? item.action : undefined;
}

/**
 * Normalizes items like Electrobun's `menuConfigWithDefaults`, dropping `data`.
 * Accelerators of items matching `nativeAccelerator` are marked as handled by
 * the native menu.
 */
export function serializeMenu(
	items: readonly ApplicationMenuItemConfig[],
	nativeAccelerator?: (item: ApplicationMenuItemConfig) => boolean,
): SerializedMenuItem[] {
	return items.map((item): SerializedMenuItem => {
		if (isDivider(item)) return { type: "divider" };
		const role = itemRole(item);
		const accelerator = item.accelerator || undefined;
		return {
			type: "normal",
			label: item.label || (role ? roleLabel(role) : ""),
			...(role ? { role } : { action: itemAction(item) ?? "" }),
			tooltip: item.tooltip || undefined,
			enabled: item.enabled !== false,
			checked: Boolean(item.checked),
			hidden: Boolean(item.hidden),
			accelerator,
			...(accelerator && nativeAccelerator?.(item)
				? { nativeAccelerator: true }
				: {}),
			...(item.submenu
				? { submenu: serializeMenu(item.submenu, nativeAccelerator) }
				: {}),
		};
	});
}

export function itemAtPath<
	T extends ApplicationMenuItemConfig | SerializedMenuItem,
>(items: readonly T[], path: readonly number[]): T | undefined {
	let level: readonly T[] | undefined = items;
	let item: T | undefined;
	for (const index of path) {
		if (!level) return undefined;
		item = level[index];
		if (!item || isDivider(item)) return undefined;
		level = (item as { submenu?: T[] }).submenu;
	}
	return item;
}
