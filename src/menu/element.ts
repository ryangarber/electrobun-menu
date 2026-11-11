import {
	type Accelerator,
	formatAccelerator,
	isSystemAccelerator,
	matchesAccelerator,
	parseAccelerator,
} from "../shared/accelerator.ts";
import { isMenuMode, resolveMenuMode } from "../shared/mode.ts";
import { originOf, placeItems, sourceIndexOf } from "../shared/placement.ts";
import {
	defaultRoleAccelerator,
	isDivider,
	parseMnemonic,
	roleLabel,
	webviewRoles,
} from "../shared/roles.ts";
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
	type SerializedMenuItem,
	type SupportedOS,
	type UntypedRPC,
} from "../shared/types.ts";
import { baseStyles, defaultStyles } from "./styles.ts";

export type MenuSelectSource = "pointer" | "keyboard" | "accelerator";

export type MenuSelectDetail = {
	/** The item as configured, or as serialized by the main process when using `rpc`. */
	item: ApplicationMenuItemConfig | SerializedMenuItem;
	/** Indices from the top-level menu down to the item. */
	path: number[];
	action?: string;
	role?: MenuRole;
	source: MenuSelectSource;
};

export type MenuSelectEvent = CustomEvent<MenuSelectDetail>;
export type MenuOpenEvent = CustomEvent<{ index: number }>;
export type MenuCloseEvent = CustomEvent<null>;
export type MenuModeChangeEvent = CustomEvent<{ mode: MenuMode }>;

export interface ElectrobunMenuElementEventMap extends HTMLElementEventMap {
	/** Cancelable. Fired before the item's role runs or its click is sent to the main process. */
	menuselect: MenuSelectEvent;
	menuopen: MenuOpenEvent;
	menuclose: MenuCloseEvent;
	menumodechange: MenuModeChangeEvent;
}

/** `"auto"` enables Alt/F10 activation and Alt+mnemonic everywhere but macOS. */
export type AltKeyBehavior = "auto" | "on" | "off";

/** Return `false` to fall through to the built-in behavior. */
export type WebviewRoleHandler = (detail: MenuSelectDetail) => unknown;

type ViewItem =
	| { kind: "divider" }
	| {
			kind: "item";
			index: number;
			/** Path to the item in the configured items, before filtering. */
			sourcePath: number[];
			source: ApplicationMenuItemConfig | SerializedMenuItem;
			text: string;
			mnemonicIndex: number;
			action?: string;
			role?: string;
			tooltip?: string;
			enabled: boolean;
			checked: boolean;
			hidden: boolean;
			accelerator?: Accelerator;
			acceleratorText?: string;
			submenu?: ViewItem[];
	  };

type ItemView = Extract<ViewItem, { kind: "item" }>;

type RegisteredAccelerator = { accelerator: Accelerator; path: number[] };

type Level = {
	el: HTMLElement;
	items: ViewItem[];
	/** Index of the item in the parent level that opened this one. */
	anchor: number;
};

type ElectrobunGlobals = {
	__electrobunPlatform?: string;
	__electrobunWindowId?: number;
	__electrobunWebviewId?: number;
};

const SUBMENU_DELAY = 150;

const HTMLElementBase = (
	typeof HTMLElement === "undefined" ? class {} : HTMLElement
) as typeof HTMLElement;

function detectOS(): SupportedOS {
	switch ((globalThis as ElectrobunGlobals).__electrobunPlatform) {
		case "macos":
			return "macos";
		case "windows":
			return "win";
		case "linux":
			return "linux";
	}
	const nav = globalThis.navigator as
		| (Navigator & { userAgentData?: { platform?: string } })
		| undefined;
	const hint =
		nav?.userAgentData?.platform || nav?.platform || nav?.userAgent || "";
	if (/mac|iphone|ipad/i.test(hint)) return "macos";
	if (/win/i.test(hint)) return "win";
	return "linux";
}

function mnemonicChar(item: ItemView): string | undefined {
	return item.mnemonicIndex >= 0
		? item.text.charAt(item.mnemonicIndex).toLowerCase()
		: undefined;
}

function setPart(el: Element, token: string, on: boolean) {
	const parts = new Set(
		(el.getAttribute("part") ?? "").split(/\s+/).filter(Boolean),
	);
	if (on) parts.add(token);
	else parts.delete(token);
	el.setAttribute("part", [...parts].join(" "));
}

function isSelectable(item: ViewItem | undefined): item is ItemView {
	return item?.kind === "item" && item.enabled && !item.hidden;
}

function pasteText() {
	navigator.clipboard
		?.readText()
		.then((text) => document.execCommand("insertText", false, text))
		.catch(() => {});
}

function runWebviewRole(role: string) {
	switch (role) {
		case "paste":
			if (!document.execCommand("paste")) pasteText();
			return;
		case "pasteAndMatchStyle":
			pasteText();
			return;
		case "startSpeaking": {
			const text = document.getSelection()?.toString();
			if (text && "speechSynthesis" in globalThis) {
				speechSynthesis.speak(new SpeechSynthesisUtterance(text));
			}
			return;
		}
		case "stopSpeaking":
			if ("speechSynthesis" in globalThis) speechSynthesis.cancel();
			return;
		default:
			// undo, redo, cut, copy, delete and selectAll share execCommand names.
			document.execCommand(role);
	}
}

function isMenuState(value: unknown): value is MenuStatePayload {
	if (typeof value !== "object" || value === null) return false;
	const state = value as Partial<MenuStatePayload>;
	return (
		typeof state.version === "number" &&
		isMenuMode(state.mode) &&
		Array.isArray(state.items)
	);
}

/**
 * `<electrobun-menu>`: a menu bar rendered in the webview with the items
 * placed there (by the menu's mode, `"webview"` or `"both"`, or by an item's
 * own per-OS mode), and hidden with an `empty` attribute when there are none.
 *
 * @attr mode - Forces a mode instead of resolving it from `config` and the OS.
 * @attr os - Overrides the detected OS (`macos`, `win` or `linux`).
 * @attr autohide - Hides the bar until it's activated with Alt, F10 or an Alt+mnemonic.
 * @attr alt-key - `auto`, `on` or `off`: Alt/F10 activation and Alt+mnemonic shortcuts.
 * @attr unstyled - Drops the default theme, keeping only layout-critical rules.
 *
 * @csspart bar - The menu bar.
 * @csspart bar-item - A top-level item. Also `highlighted`, `open`, `disabled`.
 * @csspart menu - A dropdown or submenu.
 * @csspart item - A menu item. Also `highlighted`, `open`, `disabled`, `checked`.
 * @csspart check - The check mark column.
 * @csspart label - An item's label.
 * @csspart mnemonic - The `&`-marked access key in a label.
 * @csspart accelerator - An item's keyboard shortcut.
 * @csspart submenu-arrow - The arrow on items with a submenu.
 * @csspart separator - A divider.
 */
// biome-ignore lint/suspicious/noUnsafeDeclarationMerging: the interface only adds typed event listener overloads
export class ElectrobunMenuElement extends HTMLElementBase {
	static readonly tagName = "electrobun-menu";
	static readonly observedAttributes = ["mode", "os", "unstyled", "autohide"];

	/**
	 * The custom property on `<html>` holding the height the bar takes in the
	 * page's layout: `0px` while it's empty or autohidden (an activated
	 * autohidden bar overlays the page instead). A layout sized to the
	 * viewport (`100vh`, `100dvh`, `innerHeight`, fixed panels) subtracts it
	 * or offsets by it, as it would `env(safe-area-inset-top)`.
	 */
	static readonly heightProperty = "--electrobun-menu-height";

	/** Handlers for roles selected in this webview, checked before the built-in ones. */
	roleHandlers: Partial<Record<MenuRole, WebviewRoleHandler>> = {};

	#root: ShadowRoot;
	#bar: HTMLElement;
	#themeStyle: HTMLStyleElement;
	#extraStyle: HTMLStyleElement;
	#items: ApplicationMenuItemConfig[] = [];
	#config: Partial<MenuConfig> | undefined;
	#rpc: MenuRPC | undefined;
	#remote: MenuStatePayload | undefined;
	#resolvedMode: MenuMode | undefined;
	#tree: ViewItem[] = [];
	#accelerators: RegisteredAccelerator[] = [];
	#levels: Level[] = [];
	#highlights: number[] = [];
	#active = false;
	#listening = false;
	#altPending = false;
	#hoverTimer: ReturnType<typeof setTimeout> | undefined;
	#resizeObserver: ResizeObserver | undefined;
	#publishedHeight: string | undefined;

	constructor() {
		super();
		this.#root = this.attachShadow({ mode: "open" });
		const base = document.createElement("style");
		base.textContent = baseStyles;
		this.#themeStyle = document.createElement("style");
		this.#themeStyle.textContent = defaultStyles;
		this.#extraStyle = document.createElement("style");
		this.#bar = document.createElement("div");
		this.#bar.setAttribute("part", "bar");
		this.#bar.setAttribute("role", "menubar");
		this.#bar.addEventListener("pointerdown", this.#onBarPointerDown);
		this.#bar.addEventListener("pointerover", this.#onBarPointerOver);
		this.#bar.addEventListener("click", this.#onBarClick);
		this.#root.append(base, this.#themeStyle, this.#extraStyle, this.#bar);
		this.#levels = [{ el: this.#bar, items: [], anchor: -1 }];
		this.#highlights = [-1];
	}

	/** Menu items, used when no `rpc` is set. */
	get items(): ApplicationMenuItemConfig[] {
		return this.#items;
	}
	set items(items: ApplicationMenuItemConfig[]) {
		this.#items = items ?? [];
		this.#update();
	}

	/** Per-OS modes, resolved like `createMenu` when no `mode` or `rpc` is set. */
	get config(): Partial<MenuConfig> | undefined {
		return this.#config;
	}
	set config(config: Partial<MenuConfig> | undefined) {
		this.#config = config;
		this.#update();
	}

	/** Forces a mode, unless `rpc` is set; the main process decides then. */
	get mode(): MenuMode | null {
		const mode = this.getAttribute("mode");
		return isMenuMode(mode) ? mode : null;
	}
	set mode(mode: MenuMode | null) {
		if (mode) this.setAttribute("mode", mode);
		else this.removeAttribute("mode");
	}

	get os(): SupportedOS {
		if (this.#rpc && this.#remote) return this.#remote.os;
		const os = this.getAttribute("os");
		return os === "macos" || os === "win" || os === "linux" ? os : detectOS();
	}
	set os(os: SupportedOS | null) {
		if (os) this.setAttribute("os", os);
		else this.removeAttribute("os");
	}

	/**
	 * An RPC instance from `Electroview.defineRPC`. The menu's items and mode
	 * then come from `createMenu(...).attach(window)` in the main process, and
	 * clicks are forwarded to its `application-menu-clicked` handlers.
	 */
	get rpc(): MenuRPC | undefined {
		return this.#rpc;
	}
	set rpc(rpc: MenuRPC | undefined) {
		if (rpc === this.#rpc) return;
		this.#unsubscribe();
		this.#rpc = rpc;
		this.#remote = undefined;
		if (this.isConnected) this.#subscribe();
		this.#update();
	}

	get resolvedMode(): MenuMode {
		if (this.#rpc) return this.#remote?.mode ?? "none";
		return this.mode ?? resolveMenuMode(this.os, this.#config);
	}

	get autohide(): boolean {
		return this.hasAttribute("autohide");
	}
	set autohide(value: boolean) {
		this.toggleAttribute("autohide", value);
	}

	get altKey(): AltKeyBehavior {
		const value = this.getAttribute("alt-key");
		return value === "on" || value === "off" ? value : "auto";
	}
	set altKey(value: AltKeyBehavior) {
		this.setAttribute("alt-key", value);
	}

	get unstyled(): boolean {
		return this.hasAttribute("unstyled");
	}
	set unstyled(value: boolean) {
		this.toggleAttribute("unstyled", value);
	}

	/** Extra CSS for the shadow root, applied after the default theme. */
	get extraStyles(): string {
		return this.#extraStyle.textContent ?? "";
	}
	set extraStyles(css: string) {
		this.#extraStyle.textContent = css;
	}

	/** Whether a dropdown is open. */
	get open(): boolean {
		return this.#levels.length > 1;
	}

	connectedCallback() {
		this.#subscribe();
		this.#update();
		if (typeof ResizeObserver !== "undefined") {
			this.#resizeObserver ??= new ResizeObserver(() => this.#publishHeight());
			this.#resizeObserver.observe(this);
		}
		this.#publishHeight();
	}

	disconnectedCallback() {
		this.close();
		this.#unsubscribe();
		this.#listen(false);
		this.#resizeObserver?.disconnect();
		this.#publishHeight();
	}

	attributeChangedCallback(name: string) {
		if (name === "autohide") {
			this.#publishHeight();
			return;
		}
		if (name === "unstyled") {
			this.#themeStyle.disabled = this.unstyled;
			this.#themeStyle.textContent = this.unstyled ? "" : defaultStyles;
			return;
		}
		this.#update();
	}

	/** Opens a top-level menu, as if it were clicked. */
	openMenu(index = this.#firstSelectable(this.#tree)) {
		const item = this.#tree[index];
		if (!isSelectable(item) || !item.submenu) return;
		this.#setActive(true);
		this.#openSubmenu(0, index, true);
	}

	/** Highlights the menu bar for keyboard navigation, like pressing Alt. */
	focusMenuBar() {
		this.#setActive(true, true);
		this.#highlight(0, this.#firstSelectable(this.#tree));
	}

	/** Closes any open menus and leaves keyboard navigation. */
	close() {
		const wasOpen = this.open;
		clearTimeout(this.#hoverTimer);
		this.#closeFrom(1);
		this.#highlight(0, -1);
		this.#setActive(false);
		if (wasOpen) this.#emit("menuclose", null);
	}

	#emit<K extends "menuopen" | "menuclose" | "menumodechange">(
		type: K,
		detail: ElectrobunMenuElementEventMap[K]["detail"],
	) {
		this.dispatchEvent(
			new CustomEvent(type, { detail, bubbles: true, composed: true }),
		);
	}

	#subscribe() {
		const rpc = this.#rpc as UntypedRPC | undefined;
		if (!rpc) return;
		rpc.addMessageListener(MENU_STATE_MESSAGE, this.#onState);
		try {
			Promise.resolve(rpc.send(MENU_READY_MESSAGE, {})).catch(() => {});
		} catch (error) {
			console.error("electrobun-menu: failed to request menu state", error);
		}
	}

	#unsubscribe() {
		(this.#rpc as UntypedRPC | undefined)?.removeMessageListener(
			MENU_STATE_MESSAGE,
			this.#onState,
		);
	}

	#onState = (payload: unknown) => {
		if (!isMenuState(payload)) return;
		this.#remote = payload;
		this.#update();
	};

	#update() {
		const mode = this.resolvedMode;
		const changed = mode !== this.#resolvedMode;
		this.#resolvedMode = mode;
		this.setAttribute("resolved-mode", mode);
		this.close();
		this.#build();
		this.#renderBar();
		const empty = !this.#tree.some(
			(item) => item.kind === "item" && !item.hidden,
		);
		this.toggleAttribute("empty", empty);
		this.#listen(this.isConnected && !empty);
		this.#publishHeight();
		if (changed && this.isConnected) this.#emit("menumodechange", { mode });
	}

	#build() {
		const os = this.os;
		const source: (ApplicationMenuItemConfig | SerializedMenuItem)[] = this.#rpc
			? (this.#remote?.items ?? [])
			: placeItems(this.#items, os, "webview", this.resolvedMode);
		const accelerators: RegisteredAccelerator[] = [];

		const build = (
			items: (ApplicationMenuItemConfig | SerializedMenuItem)[],
			path: number[],
			sourcePath: number[],
			enabled: boolean,
		): ViewItem[] =>
			items.map((item, index): ViewItem => {
				if (isDivider(item)) return { kind: "divider" };
				const itemSourcePath = [...sourcePath, sourceIndexOf(item, index)];
				const role = "role" in item && item.role ? item.role : undefined;
				const action =
					"action" in item && item.action ? item.action : undefined;
				const { text, mnemonicIndex } = parseMnemonic(
					item.label || (role ? roleLabel(role) : ""),
				);
				const explicit = item.accelerator
					? parseAccelerator(item.accelerator)
					: undefined;
				const fallbackText = role
					? defaultRoleAccelerator(role, os)
					: undefined;
				const fallback = fallbackText
					? parseAccelerator(fallbackText)
					: undefined;
				const accelerator = explicit ?? fallback;
				const itemEnabled = enabled && item.enabled !== false;
				const itemPath = [...path, index];
				// Default edit shortcuts are left to the browser, which already
				// handles them, even when they're also given explicitly.
				const browserHandled =
					fallback !== undefined &&
					explicit !== undefined &&
					formatAccelerator(explicit, os) === formatAccelerator(fallback, os);
				if (
					explicit &&
					itemEnabled &&
					!item.submenu &&
					!browserHandled &&
					!("nativeAccelerator" in item && item.nativeAccelerator) &&
					!isSystemAccelerator(explicit, os)
				) {
					accelerators.push({ accelerator: explicit, path: itemPath });
				}
				return {
					kind: "item",
					index,
					sourcePath: itemSourcePath,
					source: originOf(item),
					text,
					mnemonicIndex,
					action: role ? undefined : action,
					role,
					tooltip: item.tooltip,
					enabled: item.enabled !== false,
					checked: Boolean(item.checked),
					hidden: Boolean(item.hidden),
					accelerator,
					acceleratorText: accelerator
						? formatAccelerator(accelerator, os)
						: undefined,
					submenu: item.submenu
						? build(item.submenu, itemPath, itemSourcePath, itemEnabled)
						: undefined,
				};
			});

		this.#tree = build(source, [], [], true);
		this.#accelerators = accelerators;
		this.#levels[0] = { el: this.#bar, items: this.#tree, anchor: -1 };
	}

	#renderLabel(item: ItemView): HTMLElement {
		const label = document.createElement("span");
		label.setAttribute("part", "label");
		if (item.mnemonicIndex < 0) {
			label.textContent = item.text;
			return label;
		}
		const mnemonic = document.createElement("span");
		mnemonic.setAttribute("part", "mnemonic");
		mnemonic.textContent = item.text.charAt(item.mnemonicIndex);
		label.append(
			item.text.slice(0, item.mnemonicIndex),
			mnemonic,
			item.text.slice(item.mnemonicIndex + 1),
		);
		return label;
	}

	#renderBar() {
		const children: HTMLElement[] = [];
		for (const item of this.#tree) {
			if (item.kind !== "item" || item.hidden) continue;
			const el = document.createElement("div");
			el.setAttribute("part", item.enabled ? "bar-item" : "bar-item disabled");
			el.setAttribute("role", "menuitem");
			el.dataset.index = String(item.index);
			if (item.submenu) {
				el.setAttribute("aria-haspopup", "menu");
				el.setAttribute("aria-expanded", "false");
			}
			if (!item.enabled) el.setAttribute("aria-disabled", "true");
			if (item.tooltip) el.title = item.tooltip;
			el.append(this.#renderLabel(item));
			children.push(el);
		}
		this.#bar.replaceChildren(...children);
	}

	#renderMenu(items: ViewItem[], level: number): HTMLElement {
		const menu = document.createElement("div");
		menu.setAttribute("part", "menu");
		menu.setAttribute("role", "menu");
		menu.dataset.level = String(level);
		for (const item of items) {
			if (item.kind === "divider") {
				const separator = document.createElement("div");
				separator.setAttribute("part", "separator");
				separator.setAttribute("role", "separator");
				menu.append(separator);
				continue;
			}
			if (item.hidden) continue;
			const el = document.createElement("div");
			const parts = ["item"];
			if (!item.enabled) parts.push("disabled");
			if (item.checked) parts.push("checked");
			el.setAttribute("part", parts.join(" "));
			el.setAttribute("role", item.checked ? "menuitemcheckbox" : "menuitem");
			el.dataset.index = String(item.index);
			if (item.checked) el.setAttribute("aria-checked", "true");
			if (!item.enabled) el.setAttribute("aria-disabled", "true");
			if (item.submenu) {
				el.setAttribute("aria-haspopup", "menu");
				el.setAttribute("aria-expanded", "false");
			}
			if (item.tooltip) el.title = item.tooltip;
			if (item.acceleratorText)
				el.setAttribute("aria-keyshortcuts", item.acceleratorText);

			const check = document.createElement("span");
			check.setAttribute("part", "check");
			check.textContent = item.checked ? "✓" : "";
			const accelerator = document.createElement("span");
			accelerator.setAttribute("part", "accelerator");
			accelerator.textContent = item.submenu
				? ""
				: (item.acceleratorText ?? "");
			const arrow = document.createElement("span");
			arrow.setAttribute("part", "submenu-arrow");
			arrow.textContent = item.submenu ? "›" : "";
			el.append(check, this.#renderLabel(item), accelerator, arrow);
			menu.append(el);
		}
		menu.addEventListener("pointerdown", (event) => event.preventDefault());
		menu.addEventListener("pointerover", this.#onMenuPointerOver);
		menu.addEventListener("pointerleave", this.#onMenuPointerLeave);
		menu.addEventListener("click", this.#onMenuClick);
		return menu;
	}

	#itemEl(level: number, index: number): HTMLElement | null {
		return (
			this.#levels[level]?.el.querySelector<HTMLElement>(
				`:scope > [data-index="${index}"]`,
			) ?? null
		);
	}

	#highlight(level: number, index: number) {
		const previous = this.#highlights[level] ?? -1;
		if (previous !== index && previous >= 0) {
			const el = this.#itemEl(level, previous);
			if (el) setPart(el, "highlighted", false);
		}
		this.#highlights[level] = index;
		if (index >= 0) {
			const el = this.#itemEl(level, index);
			if (el) {
				setPart(el, "highlighted", true);
				el.scrollIntoView?.({ block: "nearest" });
			}
		}
	}

	/** Sets {@link ElectrobunMenuElement.heightProperty}, or clears it once disconnected. */
	#publishHeight() {
		const style = this.ownerDocument?.documentElement?.style;
		if (!style) return;
		const name = ElectrobunMenuElement.heightProperty;
		if (!this.isConnected) {
			if (this.#publishedHeight !== undefined) style.removeProperty(name);
			this.#publishedHeight = undefined;
			return;
		}
		const inFlow = !this.autohide && !this.hasAttribute("empty");
		const height = `${inFlow ? this.getBoundingClientRect().height : 0}px`;
		if (height === this.#publishedHeight) return;
		this.#publishedHeight = height;
		style.setProperty(name, height);
	}

	#setActive(active: boolean, keyboard = false) {
		this.#active = active;
		this.toggleAttribute("active", active);
		if (!active) this.removeAttribute("show-mnemonics");
		else if (keyboard && this.#altEnabled)
			this.setAttribute("show-mnemonics", "");
	}

	get #altEnabled(): boolean {
		const behavior = this.altKey;
		return behavior === "on" || (behavior === "auto" && this.os !== "macos");
	}

	#openSubmenu(level: number, index: number, highlightFirst: boolean) {
		clearTimeout(this.#hoverTimer);
		const wasOpen = this.open;
		this.#closeFrom(level + 1);
		this.#highlight(level, index);
		const item = this.#levels[level]?.items[index];
		const anchor = this.#itemEl(level, index);
		if (!isSelectable(item) || !item.submenu || !anchor) return;

		const menu = this.#renderMenu(item.submenu, level + 1);
		this.#levels.push({ el: menu, items: item.submenu, anchor: index });
		this.#highlights[level + 1] = -1;
		setPart(anchor, "open", true);
		anchor.setAttribute("aria-expanded", "true");
		this.#root.append(menu);
		if (typeof menu.showPopover === "function") {
			menu.popover = "manual";
			menu.showPopover();
		}
		this.#position(menu, anchor, level + 1);
		this.toggleAttribute("open", true);
		if (highlightFirst)
			this.#highlight(level + 1, this.#firstSelectable(item.submenu));
		if (level === 0 && !wasOpen) this.#emit("menuopen", { index });
	}

	#closeFrom(level: number) {
		while (this.#levels.length > Math.max(level, 1)) {
			const closing = this.#levels.pop();
			closing?.el.remove();
			const anchor =
				closing && this.#itemEl(this.#levels.length - 1, closing.anchor);
			if (anchor) {
				setPart(anchor, "open", false);
				anchor.setAttribute("aria-expanded", "false");
			}
		}
		this.#highlights.length = this.#levels.length;
		if (!this.open) this.removeAttribute("open");
	}

	#position(menu: HTMLElement, anchor: HTMLElement, level: number) {
		const viewportWidth = document.documentElement.clientWidth || innerWidth;
		const viewportHeight = document.documentElement.clientHeight || innerHeight;
		const anchorRect = anchor.getBoundingClientRect();
		menu.style.left = "0px";
		menu.style.top = "0px";
		menu.style.maxHeight = "";
		const { width, height } = menu.getBoundingClientRect();
		let left: number;
		let top: number;
		if (level === 1) {
			left = anchorRect.left;
			top = anchorRect.bottom;
			if (top + height > viewportHeight) {
				menu.style.maxHeight = `${Math.max(viewportHeight - top, 100)}px`;
			}
		} else {
			const padding = Number.parseFloat(getComputedStyle(menu).paddingTop) || 0;
			left = anchorRect.right;
			top = anchorRect.top - padding;
			if (left + width > viewportWidth) left = anchorRect.left - width;
		}
		left = Math.min(Math.max(left, 0), Math.max(viewportWidth - width, 0));
		top = Math.min(
			Math.max(top, 0),
			Math.max(viewportHeight - Math.min(height, viewportHeight), 0),
		);
		menu.style.left = `${left}px`;
		menu.style.top = `${top}px`;
	}

	#firstSelectable(items: ViewItem[]): number {
		const item = items.find(isSelectable);
		return item ? item.index : -1;
	}

	#lastSelectable(items: ViewItem[]): number {
		const item = items.findLast(isSelectable);
		return item ? item.index : -1;
	}

	#step(items: ViewItem[], from: number, delta: 1 | -1): number {
		const selectable = items.filter(isSelectable);
		if (selectable.length === 0) return -1;
		const position = selectable.findIndex((item) => item.index === from);
		if (position < 0)
			return (delta > 0 ? selectable[0] : selectable.at(-1))?.index ?? -1;
		const next = (position + delta + selectable.length) % selectable.length;
		return selectable[next]?.index ?? -1;
	}

	#pathTo(level: number, index: number): number[] {
		return [
			...this.#levels.slice(1, level + 1).map((entry) => entry.anchor),
			index,
		];
	}

	#indexFromEvent(event: Event): number {
		const el = (event.target as Element | null)?.closest?.("[data-index]");
		return el ? Number((el as HTMLElement).dataset.index) : -1;
	}

	#levelFromEvent(event: Event): number {
		const menu = (event.currentTarget as HTMLElement | null)?.dataset.level;
		return menu ? Number(menu) : 0;
	}

	#onBarPointerDown = (event: PointerEvent) => {
		if (event.button !== 0) return;
		event.preventDefault();
		const index = this.#indexFromEvent(event);
		const item = this.#tree[index];
		if (!isSelectable(item)) return;
		if (this.open && this.#levels[1]?.anchor === index) {
			this.close();
			return;
		}
		this.#setActive(true);
		if (item.submenu) this.#openSubmenu(0, index, false);
		else this.#highlight(0, index);
	};

	#onBarPointerOver = (event: PointerEvent) => {
		const index = this.#indexFromEvent(event);
		if (index < 0 || index === this.#highlights[0]) return;
		if (!this.open) {
			if (this.#active) this.#highlight(0, index);
			return;
		}
		const item = this.#tree[index];
		if (isSelectable(item) && item.submenu) this.#openSubmenu(0, index, false);
		else {
			this.#closeFrom(1);
			this.#highlight(0, index);
		}
	};

	#onBarClick = (event: MouseEvent) => {
		const index = this.#indexFromEvent(event);
		const item = this.#tree[index];
		if (isSelectable(item) && !item.submenu) this.#select([index], "pointer");
	};

	#onMenuPointerOver = (event: PointerEvent) => {
		const level = this.#levelFromEvent(event);
		const index = this.#indexFromEvent(event);
		const item = this.#levels[level]?.items[index];
		if (index < 0 || !item || index === this.#highlights[level]) return;
		clearTimeout(this.#hoverTimer);
		this.#highlight(level, isSelectable(item) ? index : -1);
		this.#hoverTimer = setTimeout(() => {
			if (isSelectable(item) && item.submenu)
				this.#openSubmenu(level, index, false);
			else this.#closeFrom(level + 1);
		}, SUBMENU_DELAY);
	};

	#onMenuPointerLeave = (event: PointerEvent) => {
		const level = this.#levelFromEvent(event);
		if (this.#levels.length - 1 === level) {
			clearTimeout(this.#hoverTimer);
			this.#highlight(level, -1);
		}
	};

	#onMenuClick = (event: MouseEvent) => {
		const level = this.#levelFromEvent(event);
		const index = this.#indexFromEvent(event);
		const item = this.#levels[level]?.items[index];
		if (!isSelectable(item)) return;
		if (item.submenu) this.#openSubmenu(level, index, false);
		else this.#select(this.#pathTo(level, index), "pointer");
	};

	#listen(on: boolean) {
		if (on === this.#listening) return;
		this.#listening = on;
		if (on) {
			window.addEventListener("keydown", this.#onKeyDown, true);
			window.addEventListener("keyup", this.#onKeyUp, true);
			window.addEventListener("pointerdown", this.#onWindowPointerDown, true);
			window.addEventListener("blur", this.#onWindowBlur);
			window.addEventListener("resize", this.#onWindowBlur);
		} else {
			window.removeEventListener("keydown", this.#onKeyDown, true);
			window.removeEventListener("keyup", this.#onKeyUp, true);
			window.removeEventListener(
				"pointerdown",
				this.#onWindowPointerDown,
				true,
			);
			window.removeEventListener("blur", this.#onWindowBlur);
			window.removeEventListener("resize", this.#onWindowBlur);
		}
	}

	#onWindowPointerDown = (event: PointerEvent) => {
		this.#altPending = false;
		if (this.#active && !event.composedPath().includes(this)) this.close();
	};

	#onWindowBlur = () => {
		this.#altPending = false;
		if (this.#active) this.close();
	};

	#onKeyUp = (event: KeyboardEvent) => {
		if (event.key !== "Alt" || !this.#altPending) return;
		this.#altPending = false;
		event.preventDefault();
		if (this.#active) this.close();
		else this.focusMenuBar();
	};

	#onKeyDown = (event: KeyboardEvent) => {
		if (event.defaultPrevented || event.isComposing) return;
		if (event.key === "Alt") {
			this.#altPending = this.#altEnabled && !event.repeat;
			if (this.#active) event.preventDefault();
			return;
		}
		this.#altPending = false;

		if (this.#active) {
			if (event.ctrlKey || event.metaKey) this.close();
			else {
				this.#handleMenuKey(event);
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}

		const os = this.os;
		const match = this.#accelerators.find(({ accelerator }) =>
			matchesAccelerator(accelerator, event, os),
		);
		if (match) {
			event.preventDefault();
			event.stopPropagation();
			this.#select(match.path, "accelerator");
			return;
		}

		if (!this.#altEnabled || event.ctrlKey || event.metaKey) return;
		if (event.key === "F10" && !event.altKey && !event.shiftKey) {
			event.preventDefault();
			this.focusMenuBar();
			return;
		}
		if (event.altKey) {
			const char = this.#typedChar(event);
			const item = this.#tree.find(
				(candidate) =>
					isSelectable(candidate) && mnemonicChar(candidate) === char,
			);
			if (item?.kind === "item") {
				event.preventDefault();
				this.#setActive(true, true);
				this.#activateAt(0, item.index);
			}
		}
	};

	#typedChar(event: KeyboardEvent): string {
		if (event.key.length === 1 && /\p{L}|\p{N}/u.test(event.key))
			return event.key.toLowerCase();
		// Alt can change the produced character; fall back to the physical key.
		const physical = /^(?:Key|Digit)(.)$/.exec(event.code)?.[1];
		return (physical ?? event.key).toLowerCase();
	}

	/** Opens an item's submenu with its first item highlighted, or selects it. */
	#activateAt(level: number, index: number) {
		const item = this.#levels[level]?.items[index];
		if (!isSelectable(item)) return;
		if (item.submenu) this.#openSubmenu(level, index, true);
		else this.#select(this.#pathTo(level, index), "keyboard");
	}

	#handleMenuKey(event: KeyboardEvent) {
		const level = this.#levels.length - 1;
		const items = this.#levels[level]?.items ?? [];
		const current = this.#highlights[level] ?? -1;
		const barIndex = this.#levels[1]?.anchor ?? this.#highlights[0] ?? -1;

		const moveBar = (delta: 1 | -1) => {
			const next = this.#step(this.#tree, barIndex, delta);
			const item = this.#tree[next];
			if (this.open && isSelectable(item) && item.submenu)
				this.#openSubmenu(0, next, true);
			else {
				this.#closeFrom(1);
				this.#highlight(0, next);
			}
		};

		switch (event.key) {
			case "ArrowDown":
			case "ArrowUp": {
				const delta = event.key === "ArrowDown" ? 1 : -1;
				if (level === 0) {
					const item = this.#tree[current];
					if (!isSelectable(item) || !item.submenu) return;
					this.#openSubmenu(0, current, false);
					const submenu = item.submenu;
					this.#highlight(
						1,
						delta > 0
							? this.#firstSelectable(submenu)
							: this.#lastSelectable(submenu),
					);
				} else {
					this.#highlight(level, this.#step(items, current, delta));
				}
				return;
			}
			case "ArrowRight": {
				const item = items[current];
				if (level > 0 && isSelectable(item) && item.submenu) {
					this.#openSubmenu(level, current, true);
				} else moveBar(1);
				return;
			}
			case "ArrowLeft":
				if (level > 1) this.#closeFrom(level);
				else moveBar(-1);
				return;
			case "Home":
			case "End":
				this.#highlight(
					level,
					event.key === "Home"
						? this.#firstSelectable(items)
						: this.#lastSelectable(items),
				);
				return;
			case "Enter":
			case " ":
				this.#activateAt(level, current);
				return;
			case "Escape":
				if (level > 0) {
					this.#closeFrom(level);
					if (level === 1) this.#setActive(true, true);
				} else this.close();
				return;
			case "Tab":
				this.close();
				return;
		}

		if (event.key.length !== 1 && !event.altKey) return;
		const char = this.#typedChar(event);
		const mnemonics = items.filter(
			(item): item is ItemView =>
				isSelectable(item) && mnemonicChar(item) === char,
		);
		if (mnemonics.length === 1 && mnemonics[0]) {
			this.#activateAt(level, mnemonics[0].index);
			return;
		}
		const candidates = mnemonics.length
			? mnemonics
			: items.filter(
					(item): item is ItemView =>
						isSelectable(item) && item.text.toLowerCase().startsWith(char),
				);
		const next =
			candidates.find((item) => item.index > current) ?? candidates[0];
		if (next) this.#highlight(level, next.index);
	}

	#viewAt(path: number[]): ItemView | undefined {
		let items: ViewItem[] | undefined = this.#tree;
		let view: ItemView | undefined;
		for (const index of path) {
			const item: ViewItem | undefined = items?.[index];
			if (item?.kind !== "item") return undefined;
			view = item;
			items = item.submenu;
		}
		return view;
	}

	#select(path: number[], source: MenuSelectSource) {
		const view = this.#viewAt(path);
		this.close();
		if (!view?.enabled) return;
		const detail: MenuSelectDetail = {
			item: view.source,
			path: view.sourcePath,
			action: view.action,
			role: view.role,
			source,
		};
		const event = new CustomEvent("menuselect", {
			detail,
			bubbles: true,
			composed: true,
			cancelable: true,
		});
		if (!this.dispatchEvent(event)) return;

		if (view.role) {
			const handler = this.roleHandlers[view.role];
			if (handler && handler(detail) !== false) return;
			if (webviewRoles.has(view.role)) {
				runWebviewRole(view.role);
				return;
			}
		}

		const rpc = this.#rpc as UntypedRPC | undefined;
		if (!rpc || !this.#remote) return;
		const globals = globalThis as ElectrobunGlobals;
		const payload: MenuSelectPayload = {
			version: this.#remote.version,
			path,
			windowId: globals.__electrobunWindowId,
			webviewId: globals.__electrobunWebviewId,
		};
		try {
			Promise.resolve(rpc.send(MENU_SELECT_MESSAGE, payload)).catch(() => {});
		} catch (error) {
			console.error("electrobun-menu: failed to send menu selection", error);
		}
	}
}

export interface ElectrobunMenuElement {
	addEventListener<K extends keyof ElectrobunMenuElementEventMap>(
		type: K,
		listener: (
			this: ElectrobunMenuElement,
			event: ElectrobunMenuElementEventMap[K],
		) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
	addEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | AddEventListenerOptions,
	): void;
	removeEventListener<K extends keyof ElectrobunMenuElementEventMap>(
		type: K,
		listener: (
			this: ElectrobunMenuElement,
			event: ElectrobunMenuElementEventMap[K],
		) => unknown,
		options?: boolean | EventListenerOptions,
	): void;
	removeEventListener(
		type: string,
		listener: EventListenerOrEventListenerObject,
		options?: boolean | EventListenerOptions,
	): void;
}
