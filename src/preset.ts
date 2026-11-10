import type { MenuTemplate } from "./core.ts";
import {
	defaultRoleAccelerator,
	hasItems,
	tidyDividers,
} from "./shared/roles.ts";
import type {
	ApplicationMenuItemConfig,
	MenuItemPlacement,
	MenuMode,
	SupportedOS,
} from "./shared/types.ts";

type Items = ApplicationMenuItemConfig[];

/**
 * Items to add to a standard menu: an array, or an object that also sets
 * where they go relative to the standard items and where the whole menu is
 * shown on each OS. `false` drops the standard menu.
 */
export type MenuSlot =
	| Items
	| (MenuItemPlacement & { items?: Items; position?: "start" | "end" })
	| false;

export type StandardMenuOptions = {
	/** Used in the About, Hide and Quit labels. */
	appName?: string;
	/** Shown by the built-in About dialog on Windows and Linux. */
	version?: string;
	/** macOS app menu; on Windows and Linux these go in File, above Exit. */
	app?: MenuSlot;
	file?: MenuSlot;
	edit?: MenuSlot;
	view?: MenuSlot;
	/** Only macOS has a standard Window menu; elsewhere it's shown when given items. */
	window?: MenuSlot;
	help?: MenuSlot;
	/** Extra top-level menus, placed after View. */
	menus?: Items;
};

const divider = { type: "divider" } as const;

type Slot = MenuItemPlacement & {
	items: Items;
	position?: "start" | "end";
};

function normalize(slot: MenuSlot | undefined): Slot | undefined {
	if (slot === false) return undefined;
	if (!slot) return { items: [] };
	if (Array.isArray(slot)) return { items: slot };
	const { items = [], ...rest } = slot;
	return { items, ...rest };
}

function around(slot: Slot, standard: Items, position: "start" | "end") {
	return (slot.position ?? position) === "start"
		? [...slot.items, divider, ...standard]
		: [...standard, divider, ...slot.items];
}

function role(
	name: string,
	os: SupportedOS,
	extra: Partial<ApplicationMenuItemConfig> = {},
): ApplicationMenuItemConfig {
	const accelerator = defaultRoleAccelerator(name, os);
	return {
		role: name,
		...(accelerator ? { accelerator } : {}),
		...extra,
	} as ApplicationMenuItemConfig;
}

/**
 * The menus users expect in an app on each OS, laid out by its conventions,
 * with slots for your own items. On macOS, while the menu is shown in the
 * webview, the standard menus (and items you add to them) are also placed in
 * the native menu bar; override that per item or per slot with `macos: { mode }`.
 *
 * ```ts
 * createMenu(Electrobun, standardMenu({ appName: "Notes", file: [newItem] }));
 * ```
 */
export function standardMenu(options: StandardMenuOptions = {}): MenuTemplate {
	return ({ os, mode }) => {
		const { appName, version } = options;
		const named = (label: string) =>
			appName ? `${label} ${appName}` : undefined;
		const about = (label = named("About")) =>
			role("about", os, {
				label,
				...(appName || version ? { data: { name: appName, version } } : {}),
			});

		// macOS keeps its standard menus in the menu bar too, since that's where
		// Quit, Hide, the edit commands and window commands are expected.
		const placement: MenuItemPlacement =
			os !== "macos"
				? {}
				: mode === "webview"
					? { macos: { mode: "both" satisfies MenuMode } }
					: mode === "none"
						? { macos: { mode: "native" satisfies MenuMode } }
						: {};

		const menu = (
			label: string,
			slot: Slot | undefined,
			submenu: Items,
			extra: Partial<ApplicationMenuItemConfig> = {},
		): Items => {
			if (!slot) return [];
			const items = tidyDividers(submenu);
			if (!hasItems(items)) return [];
			const { items: _items, position: _position, ...slotPlacement } = slot;
			return [
				{ label, ...placement, ...extra, ...slotPlacement, submenu: items },
			];
		};

		const app = normalize(options.app);
		const file = normalize(options.file);
		const edit = normalize(options.edit);
		const view = normalize(options.view);
		const window = normalize(options.window);
		const help = normalize(options.help);
		const extraMenus = options.menus ?? [];

		if (os === "macos") {
			return [
				...menu(
					appName ?? "App",
					app,
					[
						about(),
						divider,
						...(app?.items ?? []),
						divider,
						role("hide", os, {
							label: named("Hide"),
							accelerator: "CmdOrCtrl+H",
						}),
						role("hideOthers", os, { accelerator: "CmdOrCtrl+Alt+H" }),
						role("showAll", os),
						divider,
						role("quit", os, {
							label: named("Quit"),
							accelerator: "CmdOrCtrl+Q",
						}),
					],
					{ role: "appMenu" },
				),
				...menu(
					"File",
					file,
					file
						? around(
								file,
								[
									role("close", os, {
										label: "Close Window",
										accelerator: "CmdOrCtrl+W",
									}),
								],
								"start",
							)
						: [],
				),
				...menu(
					"Edit",
					edit,
					edit
						? around(
								edit,
								[
									role("undo", os),
									role("redo", os),
									divider,
									role("cut", os),
									role("copy", os),
									role("paste", os),
									role("pasteAndMatchStyle", os),
									role("delete", os),
									role("selectAll", os),
									divider,
									{
										label: "Speech",
										submenu: [
											role("startSpeaking", os),
											role("stopSpeaking", os),
										],
									},
								],
								"end",
							)
						: [],
				),
				...menu(
					"View",
					view,
					view
						? around(
								view,
								[
									role("toggleFullScreen", os, {
										label: "Enter Full Screen",
										accelerator: "Ctrl+Cmd+F",
									}),
								],
								"start",
							)
						: [],
				),
				...extraMenus,
				...menu(
					"Window",
					window,
					window
						? around(
								window,
								[
									role("minimize", os, { accelerator: "CmdOrCtrl+M" }),
									role("zoom", os),
									divider,
									role("bringAllToFront", os),
								],
								"end",
							)
						: [],
				),
				...menu("Help", help, help?.items ?? []),
			];
		}

		const quit =
			os === "win"
				? role("quit", os, { label: "E&xit", accelerator: "Alt+F4" })
				: role("quit", os, { label: "&Quit", accelerator: "CmdOrCtrl+Q" });
		const close = role("close", os, {
			label: "&Close",
			accelerator: "CmdOrCtrl+W",
		});

		return [
			...menu(
				"&File",
				file,
				file
					? [
							...around(file, [close], "start"),
							divider,
							...(app?.items ?? []),
							divider,
							quit,
						]
					: [],
			),
			...menu(
				"&Edit",
				edit,
				edit
					? around(
							edit,
							[
								role("undo", os, { label: "&Undo" }),
								role("redo", os, { label: "&Redo" }),
								divider,
								role("cut", os, { label: "Cu&t" }),
								role("copy", os, { label: "&Copy" }),
								role("paste", os, { label: "&Paste" }),
								role("delete", os, { label: "&Delete" }),
								divider,
								role("selectAll", os, { label: "Select &All" }),
							],
							"end",
						)
					: [],
			),
			...menu(
				"&View",
				view,
				view
					? around(
							view,
							[
								role("toggleFullScreen", os, {
									label: "&Full Screen",
									accelerator: "F11",
								}),
							],
							"start",
						)
					: [],
			),
			...extraMenus,
			...menu("&Window", window, window?.items ?? []),
			...menu(
				"&Help",
				help,
				help
					? around(
							help,
							[about(appName ? `&About ${appName}` : "&About")],
							"start",
						)
					: [],
			),
		];
	};
}
