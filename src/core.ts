import { buildNativeMenu, type NativeMenu } from "./native.ts";
import { resolveMenuMode } from "./shared/mode.ts";
import { originOf, placeItems } from "./shared/placement.ts";
import {
	isDivider,
	itemAction,
	itemAtPath,
	itemRole,
	roleLabel,
	serializeMenu,
	stripMnemonics,
} from "./shared/roles.ts";
import {
	type ApplicationMenuItemConfig,
	MENU_READY_MESSAGE,
	MENU_SELECT_MESSAGE,
	MENU_STATE_MESSAGE,
	type MenuConfig,
	type MenuMode,
	type MenuRole,
	type MenuRPC,
	type MenuSelectPayload,
	type MenuStatePayload,
	type SupportedOS,
	type UntypedRPC,
} from "./shared/types.ts";
import type {
	ApplicationMenuClickedEvent,
	ApplicationMenuClickedHandler,
	ElectrobunLike,
	MenuAttachTarget,
	RoleHandler,
	RoleHandlerContext,
} from "./types.ts";
import { OS } from "./utils.ts";

export type CreateMenuOptions = Partial<MenuConfig> & {
	/**
	 * Handlers for roles, from the webview menu and the native menu alike.
	 * Webview menus have built-in handlers for `quit`, `close`, `hide`,
	 * `minimize`, `zoom`, `about` and the full screen roles; native menus use
	 * the OS's behavior for roles without a handler here.
	 */
	roles?: Partial<Record<MenuRole, RoleHandler>>;
};

/** Builds items for the current OS and the menu's mode there, like `standardMenu()`. */
export type MenuTemplate = (context: {
	os: SupportedOS;
	mode: MenuMode;
}) => ApplicationMenuItemConfig[];

export type MenuItems = ApplicationMenuItemConfig[] | MenuTemplate;

export interface ElectrobunMenu {
	readonly os: SupportedOS;
	/** The mode resolved for the current OS. */
	readonly mode: MenuMode;
	readonly items: readonly ApplicationMenuItemConfig[];
	/** Replaces the menu, natively and in every attached webview. */
	setApplicationMenu(items: MenuItems): void;
	/** Receives clicks from the native menu and from webview menus alike. */
	on(
		name: "application-menu-clicked",
		handler: ApplicationMenuClickedHandler,
	): () => void;
	off(
		name: "application-menu-clicked",
		handler: ApplicationMenuClickedHandler,
	): void;
	/** Syncs the menu with an `<electrobun-menu>` in this window or view. */
	attach(target: MenuAttachTarget): () => void;
	detach(target: MenuAttachTarget): void;
	dispose(): void;
}

class WebviewMenuClickedEvent implements ApplicationMenuClickedEvent {
	name = "application-menu-clicked";
	data: ApplicationMenuClickedEvent["data"];
	_response: { allow: boolean } | undefined;
	responseWasSet = false;

	constructor(data: ApplicationMenuClickedEvent["data"]) {
		this.data = data;
	}

	get response(): { allow: boolean } | undefined {
		return this._response;
	}

	set response(value: { allow: boolean }) {
		this._response = value;
		this.responseWasSet = true;
	}

	clearResponse() {
		this._response = undefined;
		this.responseWasSet = false;
	}
}

const builtinRoles: Partial<
	Record<
		string,
		(context: RoleHandlerContext, electrobun: ElectrobunLike) => void
	>
> = {
	about: ({ item }, electrobun) => {
		const label = isDivider(item)
			? ""
			: stripMnemonics(item.label || roleLabel("about"));
		const info = aboutInfo(isDivider(item) ? undefined : item.data);
		electrobun.Utils?.showMessageBox?.({
			type: "info",
			title: label,
			message: info.name ?? label,
			detail: info.version ? `Version ${info.version}` : "",
		});
	},
	quit: (_, electrobun) => electrobun.Utils?.quit(),
	close: ({ window }) => window?.close(),
	hide: ({ window }) => window?.hide(),
	minimize: ({ window }) => window?.minimize(),
	zoom: ({ window }) =>
		window?.isMaximized() ? window.unmaximize() : window?.maximize(),
	toggleFullScreen: ({ window }) =>
		window?.setFullScreen(!window.isFullScreen()),
	enterFullScreen: ({ window }) => window?.setFullScreen(true),
	exitFullScreen: ({ window }) => window?.setFullScreen(false),
};

/** An `about` item's `data` may carry `{ name, version }` for the built-in dialog. */
function aboutInfo(data: unknown): { name?: string; version?: string } {
	if (typeof data !== "object" || data === null) return {};
	const { name, version } = data as Record<string, unknown>;
	return {
		name: typeof name === "string" ? name : undefined,
		version: typeof version === "string" ? version : undefined,
	};
}

function windowIdOf(event: unknown): number | undefined {
	const id = (event as { data?: { id?: unknown } } | undefined)?.data?.id;
	return typeof id === "number" ? id : undefined;
}

function isRPC(target: unknown): target is MenuRPC {
	return (
		typeof target === "object" &&
		target !== null &&
		typeof (target as MenuRPC).send === "function" &&
		typeof (target as MenuRPC).addMessageListener === "function" &&
		typeof (target as MenuRPC).removeMessageListener === "function"
	);
}

function resolveRPC(target: MenuAttachTarget): MenuRPC | undefined {
	if (isRPC(target)) return target;
	const rpc =
		"webview" in target
			? target.webview.rpc
			: "rpc" in target
				? target.rpc
				: undefined;
	return isRPC(rpc) ? rpc : undefined;
}

function isSelectPayload(value: unknown): value is MenuSelectPayload {
	if (typeof value !== "object" || value === null) return false;
	const { version, path } = value as Partial<MenuSelectPayload>;
	return (
		typeof version === "number" &&
		Array.isArray(path) &&
		path.every((index) => Number.isInteger(index) && index >= 0)
	);
}

export function createMenu(
	electrobun: ElectrobunLike,
	items: MenuItems,
	options: CreateMenuOptions = {},
): ElectrobunMenu {
	const { roles, ...config } = options;
	const os = OS;
	const mode = resolveMenuMode(os, config);
	const listeners = new Set<ApplicationMenuClickedHandler>();
	const attached = new Map<
		MenuRPC,
		{ onReady: () => void; onSelect: (payload: unknown) => void }
	>();
	const handledRoles = new Set(
		Object.entries(roles ?? {})
			.filter(([, handler]) => handler)
			.map(([role]) => role),
	);
	const resolve = (next: MenuItems) =>
		typeof next === "function" ? next({ os, mode }) : next;
	let current = resolve(items);
	let version = 0;
	let disposed = false;
	let native: NativeMenu;
	/** The items shown in webviews; select payloads index into this. */
	let webviewItems: ApplicationMenuItemConfig[] = [];
	// Native menu clicks don't say which window was key, so track it.
	let focusedWindowId: number | undefined;

	const onFocus = (event: unknown) => {
		focusedWindowId = windowIdOf(event) ?? focusedWindowId;
	};
	const onBlur = (event: unknown) => {
		if (windowIdOf(event) === focusedWindowId) focusedWindowId = undefined;
	};
	electrobun.events?.on("focus", onFocus);
	electrobun.events?.on("blur", onBlur);

	const install = () => {
		native = buildNativeMenu(current, { os, mode, handledRoles });
		webviewItems = placeItems(current, os, "webview", mode);
		electrobun.ApplicationMenu.setApplicationMenu(native.items);
	};

	const emit = (event: ApplicationMenuClickedEvent) => {
		for (const listener of [...listeners]) {
			try {
				listener(event);
			} catch (error) {
				console.error("electrobun-menu: error in click handler", error);
			}
		}
	};

	const state = (): MenuStatePayload => ({
		version,
		os,
		mode,
		items: serializeMenu(webviewItems, (item) =>
			native.acceleratorOwners.has(originOf(item)),
		),
	});

	const send = (rpc: MenuRPC) => {
		try {
			const result = (rpc as unknown as UntypedRPC).send(
				MENU_STATE_MESSAGE,
				state(),
			);
			Promise.resolve(result).catch(() => {});
		} catch {
			// The view isn't loaded yet; it asks for the state once it is.
		}
	};

	const runRole = (
		role: string,
		item: ApplicationMenuItemConfig,
		{ windowId, webviewId }: Pick<MenuSelectPayload, "windowId" | "webviewId">,
	) => {
		const context: RoleHandlerContext = {
			role,
			item,
			windowId,
			webviewId,
			window:
				windowId === undefined
					? undefined
					: electrobun.BrowserWindow?.getById(windowId),
		};
		const handler = roles?.[role];
		if (handler && handler(context) !== false) return;
		const builtin = builtinRoles[role];
		if (builtin) builtin(context, electrobun);
		else if (!handler)
			console.warn(`electrobun-menu: no handler for role "${role}"`);
	};

	const handleSelect = (payload: unknown) => {
		if (disposed || !isSelectPayload(payload)) return;
		// Ignore clicks on a menu that has since been replaced.
		if (payload.version !== version) return;
		const shown = itemAtPath(webviewItems, payload.path);
		const item = shown && originOf(shown);
		if (!item || isDivider(item) || item.submenu || item.enabled === false)
			return;
		const role = itemRole(item);
		if (role) {
			runRole(role, item, payload);
			return;
		}
		emit(
			new WebviewMenuClickedEvent({
				id: payload.windowId,
				action: itemAction(item) ?? "",
				data: item.data,
			}),
		);
	};

	electrobun.ApplicationMenu.on("application-menu-clicked", (event) => {
		if (disposed) return;
		const clicked = event as ApplicationMenuClickedEvent;
		const roleAction = native.roleActions.get(clicked.data?.action);
		if (roleAction) {
			runRole(roleAction.role, roleAction.item, { windowId: focusedWindowId });
			return;
		}
		emit(clicked);
	});

	const menu: ElectrobunMenu = {
		os,
		mode,
		get items() {
			return current;
		},
		setApplicationMenu(next) {
			current = resolve(next);
			version++;
			install();
			for (const rpc of attached.keys()) send(rpc);
		},
		on(_name, handler) {
			listeners.add(handler);
			return () => listeners.delete(handler);
		},
		off(_name, handler) {
			listeners.delete(handler);
		},
		attach(target) {
			const rpc = resolveRPC(target);
			if (!rpc)
				throw new TypeError(
					"electrobun-menu: attach target has no RPC instance",
				);
			if (!attached.has(rpc) && !disposed) {
				const untyped = rpc as unknown as UntypedRPC;
				const handlers = { onReady: () => send(rpc), onSelect: handleSelect };
				untyped.addMessageListener(MENU_READY_MESSAGE, handlers.onReady);
				untyped.addMessageListener(MENU_SELECT_MESSAGE, handlers.onSelect);
				attached.set(rpc, handlers);
				send(rpc);
			}
			return () => menu.detach(target);
		},
		detach(target) {
			const rpc = resolveRPC(target);
			const handlers = rpc && attached.get(rpc);
			if (!rpc || !handlers) return;
			const untyped = rpc as unknown as UntypedRPC;
			untyped.removeMessageListener(MENU_READY_MESSAGE, handlers.onReady);
			untyped.removeMessageListener(MENU_SELECT_MESSAGE, handlers.onSelect);
			attached.delete(rpc);
		},
		dispose() {
			for (const rpc of [...attached.keys()]) menu.detach(rpc);
			listeners.clear();
			electrobun.events?.off?.("focus", onFocus);
			electrobun.events?.off?.("blur", onBlur);
			disposed = true;
		},
	};

	install();
	return menu;
}
