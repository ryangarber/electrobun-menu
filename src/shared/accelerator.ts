import type { SupportedOS } from "./types.ts";

export type Accelerator = {
	/** Lowercased key name, e.g. `"s"`, `"f5"`, `"pageup"`, `"+"`. */
	key: string;
	commandOrControl: boolean;
	command: boolean;
	control: boolean;
	alt: boolean;
	shift: boolean;
	super: boolean;
	/** No modifiers: Cmd+key on macOS, Ctrl+key elsewhere when the key is a letter. */
	bare: boolean;
};

type ResolvedModifiers = {
	meta: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
};

/** Parses Electron-style accelerators the same way Electrobun's native menus do. */
export function parseAccelerator(accelerator: string): Accelerator | undefined {
	const trimmed = accelerator.trim();
	if (!trimmed) return undefined;
	const parts = trimmed.split("+");
	// "Ctrl++" splits into [..., "", ""]: the key is "+".
	if (parts.length > 1 && parts.at(-1) === "" && parts.at(-2) === "") {
		parts.splice(-2, 2, "+");
	}
	const key = parts.pop()?.toLowerCase();
	if (!key) return undefined;
	const result: Accelerator = {
		key,
		commandOrControl: false,
		command: false,
		control: false,
		alt: false,
		shift: false,
		super: false,
		bare: parts.length === 0,
	};
	for (const part of parts) {
		switch (part.toLowerCase()) {
			case "commandorcontrol":
			case "cmdorctrl":
				result.commandOrControl = true;
				break;
			case "command":
			case "cmd":
				result.command = true;
				break;
			case "control":
			case "ctrl":
				result.control = true;
				break;
			case "alt":
			case "option":
				result.alt = true;
				break;
			case "shift":
				result.shift = true;
				break;
			case "super":
			case "meta":
			case "win":
				result.super = true;
				break;
		}
	}
	return result;
}

function resolveModifiers(
	accelerator: Accelerator,
	os: SupportedOS,
): ResolvedModifiers {
	if (os === "macos") {
		return {
			meta:
				accelerator.commandOrControl ||
				accelerator.bare ||
				accelerator.command ||
				accelerator.super,
			ctrl: accelerator.control,
			alt: accelerator.alt,
			shift: accelerator.shift,
		};
	}
	// Windows only adds Ctrl to bare letters; a bare "F11" means F11 alone.
	const bareLetter = accelerator.bare && /^[a-z]$/.test(accelerator.key);
	return {
		meta: accelerator.super,
		ctrl:
			accelerator.commandOrControl ||
			bareLetter ||
			accelerator.command ||
			accelerator.control,
		alt: accelerator.alt,
		shift: accelerator.shift,
	};
}

/** Shortcuts the OS handles itself, which menus show but don't register. */
export function isSystemAccelerator(
	accelerator: Accelerator,
	os: SupportedOS,
): boolean {
	if (os !== "win" || accelerator.key !== "f4") return false;
	const mods = resolveModifiers(accelerator, os);
	return mods.alt && !mods.ctrl && !mods.meta && !mods.shift;
}

const namedKeys: Record<string, string[]> = {
	return: ["Enter"],
	enter: ["Enter"],
	tab: ["Tab"],
	escape: ["Escape"],
	esc: ["Escape"],
	space: [" ", "Spacebar"],
	backspace: ["Backspace"],
	delete: ["Delete"],
	del: ["Delete"],
	insert: ["Insert"],
	up: ["ArrowUp"],
	down: ["ArrowDown"],
	left: ["ArrowLeft"],
	right: ["ArrowRight"],
	home: ["Home"],
	end: ["End"],
	pageup: ["PageUp"],
	pagedown: ["PageDown"],
	plus: ["+"],
	minus: ["-"],
};

const symbolCodes: Record<string, string> = {
	"-": "Minus",
	"=": "Equal",
	"[": "BracketLeft",
	"]": "BracketRight",
	"\\": "Backslash",
	";": "Semicolon",
	"'": "Quote",
	",": "Comma",
	".": "Period",
	"/": "Slash",
	"`": "Backquote",
};

type KeyLike = Pick<
	KeyboardEvent,
	"key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

function keyMatches(
	key: string,
	event: KeyLike,
): { match: boolean; printable: boolean } {
	const eventKey = event.key.toLowerCase();
	if (/^[a-z]$/.test(key)) {
		// Prefer the produced character so non-QWERTY layouts match their labels,
		// falling back to the physical key when a modifier (or layout) changes it.
		const match =
			eventKey === key ||
			(!/^[a-z]$/.test(eventKey) && event.code === `Key${key.toUpperCase()}`);
		return { match, printable: false };
	}
	if (/^[0-9]$/.test(key)) {
		const match =
			event.key === key ||
			(!/^[0-9]$/.test(event.key) && event.code === `Digit${key}`);
		return { match, printable: false };
	}
	if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) {
		return { match: eventKey === key, printable: false };
	}
	const named = namedKeys[key];
	if (named) {
		return {
			match: named.includes(event.key),
			printable: key === "plus" || key === "minus",
		};
	}
	if (key.length === 1) {
		const code = symbolCodes[key];
		return {
			match: event.key === key || (code !== undefined && event.code === code),
			printable: true,
		};
	}
	return { match: false, printable: false };
}

export function matchesAccelerator(
	accelerator: Accelerator,
	event: KeyLike,
	os: SupportedOS,
): boolean {
	const { match, printable } = keyMatches(accelerator.key, event);
	if (!match) return false;
	const mods = resolveModifiers(accelerator, os);
	if (event.metaKey !== mods.meta) return false;
	if (event.ctrlKey !== mods.ctrl) return false;
	if (event.altKey !== mods.alt) return false;
	// Symbols like "+" or "?" need Shift on many layouts; only enforce Shift
	// for them when the accelerator asks for it.
	if (printable && !mods.shift) return true;
	return event.shiftKey === mods.shift;
}

const macKeySymbols: Record<string, string> = {
	return: "↩",
	enter: "↩",
	tab: "⇥",
	escape: "⎋",
	esc: "⎋",
	space: "Space",
	backspace: "⌫",
	delete: "⌦",
	del: "⌦",
	up: "↑",
	down: "↓",
	left: "←",
	right: "→",
	home: "↖",
	end: "↘",
	pageup: "⇞",
	pagedown: "⇟",
	plus: "+",
	minus: "-",
};

const keyNames: Record<string, string> = {
	return: "Enter",
	enter: "Enter",
	escape: "Esc",
	esc: "Esc",
	delete: "Del",
	del: "Del",
	insert: "Ins",
	pageup: "PgUp",
	pagedown: "PgDn",
	plus: "+",
	minus: "-",
};

function displayKey(key: string, os: SupportedOS): string {
	if (os === "macos" && macKeySymbols[key]) return macKeySymbols[key];
	if (keyNames[key]) return keyNames[key];
	return key.length === 1
		? key.toUpperCase()
		: key.charAt(0).toUpperCase() + key.slice(1);
}

/** Formats an accelerator like the platform's native menus: `⇧⌘S` or `Ctrl+Shift+S`. */
export function formatAccelerator(
	accelerator: Accelerator,
	os: SupportedOS,
): string {
	const mods = resolveModifiers(accelerator, os);
	const key = displayKey(accelerator.key, os);
	if (os === "macos") {
		return `${mods.ctrl ? "⌃" : ""}${mods.alt ? "⌥" : ""}${mods.shift ? "⇧" : ""}${mods.meta ? "⌘" : ""}${key}`;
	}
	const parts: string[] = [];
	if (mods.ctrl) parts.push("Ctrl");
	if (mods.alt) parts.push("Alt");
	if (mods.shift) parts.push("Shift");
	if (mods.meta) parts.push(os === "win" ? "Win" : "Super");
	parts.push(key);
	return parts.join("+");
}
