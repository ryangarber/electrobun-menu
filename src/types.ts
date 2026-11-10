import type { ElectrobunEvent } from "electrobun/main";
import type {
	ApplicationMenuItemConfig,
	MenuRole,
	MenuRPC,
} from "./shared/types.ts";

export type { ApplicationMenu, ElectrobunEvent } from "electrobun/main";
export type {
	ApplicationMenuItemConfig,
	MenuConfig,
	MenuItemPlacement,
	MenuMode,
	MenuRole,
	MenuRPC,
	MenuSelectPayload,
	MenuStatePayload,
	NormalMenuItemConfig,
	SerializedMenuItem,
	SupportedOS,
} from "./shared/types.ts";

export type ApplicationMenuClickedEvent = ElectrobunEvent<
	{ id?: number; action: string; data?: unknown },
	{ allow: boolean }
>;

export type ApplicationMenuClickedHandler = (
	event: ApplicationMenuClickedEvent,
) => void;

export interface WindowLike {
	close(): void;
	hide(): void;
	minimize(): void;
	maximize(): void;
	unmaximize(): void;
	isMaximized(): boolean;
	setFullScreen(fullScreen: boolean): void;
	isFullScreen(): boolean;
}

/**
 * The parts of Electrobun's main-process API the menu uses. Pass the default
 * export of `electrobun/main`, or `{ ApplicationMenu, BrowserWindow, Utils, events }`.
 * `BrowserWindow` and `Utils` enable window, `quit` and `about` roles from
 * webviews; `events` tells roles handled from the native menu which window
 * is focused.
 */
export interface ElectrobunLike {
	ApplicationMenu: {
		setApplicationMenu(menu: ApplicationMenuItemConfig[]): void;
		on(
			name: "application-menu-clicked",
			handler: (event: unknown) => void,
		): void;
	};
	BrowserWindow?: { getById(id: number): WindowLike | undefined };
	Utils?: {
		quit(): unknown;
		showMessageBox?(options: {
			type?: "info";
			title?: string;
			message?: string;
			detail?: string;
		}): unknown;
	};
	events?: {
		on(name: "focus" | "blur", handler: (event: unknown) => void): unknown;
		off?(name: "focus" | "blur", handler: (event: unknown) => void): unknown;
	};
}

export type RoleHandlerContext = {
	role: MenuRole;
	item: ApplicationMenuItemConfig;
	windowId?: number;
	webviewId?: number;
	window?: WindowLike;
};

/** Return `false` to fall through to the built-in handler. */
export type RoleHandler = (context: RoleHandlerContext) => unknown;

/**
 * A `BrowserWindow`, `BrowserView`, or an RPC instance from either. Views
 * created without an `rpc` option type theirs as just `RPCWithTransport`, so
 * nested RPCs are checked when attaching rather than here.
 */
export type MenuAttachTarget =
	| MenuRPC
	| { rpc?: object }
	| { webview: { rpc?: object } };
