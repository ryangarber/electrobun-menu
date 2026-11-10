import { copyItem, originOf, placeItems } from "./shared/placement.ts";
import {
	defaultRoleAccelerator,
	hasItems,
	isDivider,
	itemRole,
	roleLabel,
	stripMnemonics,
	tidyDividers,
} from "./shared/roles.ts";
import type {
	ApplicationMenuItemConfig,
	MenuMode,
	NormalMenuItemConfig,
	SupportedOS,
} from "./shared/types.ts";

type Item = ApplicationMenuItemConfig;
type NormalItem = NormalMenuItemConfig;

const ROLE_ACTION_PREFIX = "electrobun-menu:role:";

export type NativeMenu = {
	/** Items to pass to Electrobun's `ApplicationMenu.setApplicationMenu`. */
	items: Item[];
	/** Original items whose accelerators the native menu handles. */
	acceleratorOwners: Set<object>;
	/** Internal actions standing in for roles that have a `roles` handler. */
	roleActions: Map<string, { role: string; item: NormalItem }>;
};

const divider = { type: "divider" } as const;

/** Roles that only exist in a macOS app menu, so they identify one. */
const appMenuOnlyRoles = new Set(["about", "hide", "hideOthers", "showAll"]);

function isAppMenu(item: Item | undefined, first: boolean): boolean {
	if (!item || isDivider(item) || !item.submenu) return false;
	if (itemRole(item) === "appMenu") return true;
	return (
		first &&
		item.submenu.some(
			(child) =>
				!isDivider(child) && appMenuOnlyRoles.has(itemRole(child) ?? ""),
		)
	);
}

function withoutRoles(
	items: readonly Item[],
	roles: ReadonlySet<string>,
	removed: NormalItem[],
): Item[] {
	const result: Item[] = [];
	for (const item of items) {
		if (isDivider(item)) {
			result.push(item);
			continue;
		}
		const role = itemRole(item);
		if (role && roles.has(role)) {
			removed.push(item);
			continue;
		}
		if (!item.submenu) {
			result.push(item);
			continue;
		}
		const submenu = withoutRoles(item.submenu, roles, removed);
		// Drop menus that only held moved items.
		if (hasItems(submenu) || !hasItems(item.submenu))
			result.push(copyItem(item, { submenu: tidyDividers(submenu) }));
	}
	return result;
}

const editRoles = new Set([
	"undo",
	"redo",
	"cut",
	"copy",
	"paste",
	"selectAll",
]);

function containsRole(
	items: readonly Item[],
	roles: ReadonlySet<string>,
): boolean {
	return items.some(
		(item) =>
			!isDivider(item) &&
			(roles.has(itemRole(item) ?? "") ||
				(item.submenu ? containsRole(item.submenu, roles) : false)),
	);
}

function labelOf(item: Item): string {
	return isDivider(item) ? "" : stripMnemonics(item.label ?? "").toLowerCase();
}

function stripLabels(items: readonly Item[]): Item[] {
	return items.map((item) => {
		if (isDivider(item)) return item;
		return copyItem(item, {
			...(item.label ? { label: stripMnemonics(item.label) } : {}),
			...(item.submenu ? { submenu: stripLabels(item.submenu) } : {}),
		});
	});
}

/**
 * Lays a menu out the way macOS expects: an app menu first (built from any
 * `about` and `quit` items when there isn't one), Edit and Window menus, and labels
 * without `&` mnemonics.
 */
export function macConventions(items: readonly Item[]): Item[] {
	let result = [...items];

	const appIndex = result.findIndex((item, index) =>
		isAppMenu(item, index === 0),
	);
	if (appIndex > 0) {
		const [app] = result.splice(appIndex, 1);
		result.unshift(app as Item);
	} else if (appIndex === -1) {
		const moved: NormalItem[] = [];
		result = withoutRoles(result, new Set(["about", "quit"]), moved);
		const about = moved.find((item) => itemRole(item) === "about");
		const quit = moved.find((item) => itemRole(item) === "quit");
		result.unshift({
			label: "App",
			submenu: [
				...(about ? [about, divider] : []),
				{ role: "hide", accelerator: "CmdOrCtrl+H" },
				{ role: "hideOthers", accelerator: "CmdOrCtrl+Alt+H" },
				{ role: "showAll" },
				divider,
				quit
					? // "Exit" and similar labels are written for other OSes.
						copyItem(quit, {
							label: undefined,
							accelerator: quit.accelerator || "CmdOrCtrl+Q",
						})
					: { role: "quit", accelerator: "CmdOrCtrl+Q" },
			],
		});
	}

	// WKWebView's Cmd+C/V/X/A/Z go through the main menu's edit items.
	if (!containsRole(result, editRoles)) {
		const file = result.findIndex((item) => labelOf(item) === "file");
		result.splice(file === -1 ? 1 : file + 1, 0, {
			label: "Edit",
			submenu: [
				{ role: "undo", accelerator: "CmdOrCtrl+Z" },
				{ role: "redo", accelerator: "CmdOrCtrl+Shift+Z" },
				divider,
				{ role: "cut", accelerator: "CmdOrCtrl+X" },
				{ role: "copy", accelerator: "CmdOrCtrl+C" },
				{ role: "paste", accelerator: "CmdOrCtrl+V" },
				{ role: "selectAll", accelerator: "CmdOrCtrl+A" },
			],
		});
	}

	if (!result.some((item) => labelOf(item) === "window")) {
		const helpIndex = result.findIndex((item) => labelOf(item) === "help");
		result.splice(helpIndex === -1 ? result.length : helpIndex, 0, {
			label: "Window",
			submenu: [
				{ role: "minimize", accelerator: "CmdOrCtrl+M" },
				{ role: "zoom" },
				divider,
				{ role: "bringAllToFront" },
			],
		});
	}

	return stripLabels(result);
}

/**
 * The native menu for an OS and menu mode: the items placed there, laid out
 * for macOS when on it. macOS always gets a menu, since its menu bar holds
 * the app's Quit, Hide and edit commands even while the webview menu is used.
 */
export function buildNativeMenu(
	items: readonly Item[],
	options: {
		os: SupportedOS;
		mode: MenuMode;
		handledRoles: ReadonlySet<string>;
	},
): NativeMenu {
	const { os, mode, handledRoles } = options;
	const acceleratorOwners = new Set<object>();
	const roleActions: NativeMenu["roleActions"] = new Map();

	const placed = placeItems(items, os, "native", mode);
	const layout = os === "macos" ? macConventions(placed) : placed;

	const finalize = (level: readonly Item[]): Item[] =>
		level.map((item): Item => {
			if (isDivider(item)) return item;
			const {
				macos: _macos,
				win: _win,
				linux: _linux,
				role: _role,
				...rest
			} = item as NormalItem & { role?: string };
			const role = itemRole(item);
			const origin = originOf(item);
			if (item.submenu) {
				// Electrobun doesn't know `appMenu`; macOS treats the first menu as it.
				return {
					...rest,
					...(role && role !== "appMenu" ? { role } : {}),
					submenu: finalize(item.submenu),
				};
			}
			if (item.accelerator) acceleratorOwners.add(origin);
			if (!role) return rest;
			if (!handledRoles.has(role)) return { ...rest, role };
			const action = `${ROLE_ACTION_PREFIX}${roleActions.size}`;
			roleActions.set(action, { role, item: origin });
			const accelerator = item.accelerator || defaultRoleAccelerator(role, os);
			return {
				...rest,
				label: item.label || roleLabel(role),
				action,
				...(accelerator ? { accelerator } : {}),
			};
		});

	return { items: finalize(layout), acceleratorOwners, roleActions };
}
