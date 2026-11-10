export type SupportedOS = "macos" | "win" | "linux";

/**
 * Where a menu, or an item in it, is shown: the native menu bar, the
 * `<electrobun-menu>` in the webview, both, or neither.
 */
export type MenuMode = "native" | "webview" | "both" | "none";

export type MenuConfig = { [key in SupportedOS]: { mode: MenuMode } };

export type MenuRole =
	| "about"
	| "quit"
	| "hide"
	| "hideOthers"
	| "showAll"
	| "minimize"
	| "zoom"
	| "close"
	| "bringAllToFront"
	| "cycleThroughWindows"
	| "enterFullScreen"
	| "exitFullScreen"
	| "toggleFullScreen"
	| "undo"
	| "redo"
	| "cut"
	| "copy"
	| "paste"
	| "pasteAndMatchStyle"
	| "delete"
	| "selectAll"
	| "startSpeaking"
	| "stopSpeaking"
	| "showHelp"
	/** A top-level submenu that macOS shows as the application (app name) menu. */
	| "appMenu"
	| (string & {});

/**
 * Per-OS overrides of where an item is shown, e.g. `{ macos: { mode: "both" } }`.
 * Items without one use their parent's mode, and top-level items the menu's.
 * A submenu is shown wherever any of its items are.
 */
export type MenuItemPlacement = Partial<MenuConfig>;

type MenuItemOptions = MenuItemPlacement & {
	tooltip?: string;
	data?: unknown;
	submenu?: Array<ApplicationMenuItemConfig>;
	enabled?: boolean;
	checked?: boolean;
	hidden?: boolean;
	accelerator?: string;
};

/**
 * Mirrors Electrobun's `ApplicationMenuItemConfig` without importing it, so
 * webview code doesn't have to typecheck Electrobun's main-process SDK.
 */
export type ApplicationMenuItemConfig =
	| { type: "divider" | "separator" }
	| ({ type?: "normal"; label: string; action?: string } & MenuItemOptions)
	| ({ type?: "normal"; label?: string; role?: MenuRole } & MenuItemOptions);

export type NormalMenuItemConfig = Exclude<
	ApplicationMenuItemConfig,
	{ type: "divider" | "separator" }
>;

/** An item as sent to webviews: `data` stays in the main process. */
export type SerializedMenuItem =
	| { type: "divider" }
	| {
			type: "normal";
			label: string;
			action?: string;
			role?: string;
			tooltip?: string;
			enabled: boolean;
			checked: boolean;
			hidden: boolean;
			accelerator?: string;
			/** The native menu handles `accelerator`, so the webview doesn't register it. */
			nativeAccelerator?: boolean;
			submenu?: SerializedMenuItem[];
	  };

export const MENU_STATE_MESSAGE = "electrobun-menu:state";
export const MENU_READY_MESSAGE = "electrobun-menu:ready";
export const MENU_SELECT_MESSAGE = "electrobun-menu:select";

export type MenuStatePayload = {
	version: number;
	os: SupportedOS;
	mode: MenuMode;
	items: SerializedMenuItem[];
};

export type MenuSelectPayload = {
	version: number;
	path: number[];
	windowId?: number;
	webviewId?: number;
};

/**
 * The subset of an Electrobun RPC instance (from `BrowserView.defineRPC` or
 * `Electroview.defineRPC`) used to sync the menu. Menu messages are sent
 * outside your schema, so any RPC instance is accepted.
 */
export interface MenuRPC {
	send: (...args: never[]) => unknown;
	addMessageListener: (...args: never[]) => unknown;
	removeMessageListener: (...args: never[]) => unknown;
}

export type UntypedRPC = {
	send(message: string, payload?: unknown): unknown;
	addMessageListener(
		message: string,
		listener: (payload: unknown) => void,
	): void;
	removeMessageListener(
		message: string,
		listener: (payload: unknown) => void,
	): void;
};
