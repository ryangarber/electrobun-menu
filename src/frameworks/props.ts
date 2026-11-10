import type {
	AltKeyBehavior,
	ElectrobunMenuElement,
	MenuCloseEvent,
	MenuModeChangeEvent,
	MenuOpenEvent,
	MenuSelectEvent,
	WebviewRoleHandler,
} from "../menu/element.ts";
import type {
	ApplicationMenuItemConfig,
	MenuConfig,
	MenuMode,
	MenuRole,
	MenuRPC,
	SupportedOS,
} from "../shared/types.ts";

/** Properties and attributes shared by every renderer's `<electrobun-menu>` typings. */
export type ElectrobunMenuProps = {
	items?: ApplicationMenuItemConfig[];
	config?: Partial<MenuConfig>;
	mode?: MenuMode;
	os?: SupportedOS;
	rpc?: MenuRPC;
	autohide?: boolean;
	"alt-key"?: AltKeyBehavior;
	altKey?: AltKeyBehavior;
	unstyled?: boolean;
	extraStyles?: string;
	roleHandlers?: Partial<Record<MenuRole, WebviewRoleHandler>>;
};

export type ElectrobunMenuEvents = {
	menuselect: MenuSelectEvent;
	menuopen: MenuOpenEvent;
	menuclose: MenuCloseEvent;
	menumodechange: MenuModeChangeEvent;
};

/** `onmenuselect`-style handler props, as React 19, Preact and Svelte 5 expect. */
export type ElectrobunMenuEventProps = {
	[K in keyof ElectrobunMenuEvents as `on${K}`]?: (
		event: ElectrobunMenuEvents[K] & { currentTarget: ElectrobunMenuElement },
	) => void;
};
