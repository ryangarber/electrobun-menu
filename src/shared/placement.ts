import { hasItems, isDivider, tidyDividers } from "./roles.ts";
import type {
	ApplicationMenuItemConfig,
	MenuMode,
	NormalMenuItemConfig,
	SupportedOS,
} from "./types.ts";

/** Copies made for one surface, mapped back to the item they came from. */
const origins = new WeakMap<
	object,
	{ item: NormalMenuItemConfig; index: number }
>();

/** Copies an item, remembering the original and its index in its menu. */
export function copyItem<T extends NormalMenuItemConfig>(
	item: T,
	changes: Partial<NormalMenuItemConfig> = {},
	index?: number,
): T {
	const result = { ...item, ...changes } as T;
	const origin = origins.get(item);
	origins.set(result, {
		item: origin?.item ?? item,
		index: index ?? origin?.index ?? -1,
	});
	return result;
}

/** The item a copy was made from, or the item itself. */
export function originOf<T extends ApplicationMenuItemConfig | object>(
	item: T,
): T {
	return (origins.get(item)?.item as T | undefined) ?? item;
}

/** The index of a copy's original in its menu, or `fallback`. */
export function sourceIndexOf(item: object, fallback: number): number {
	const index = origins.get(item)?.index ?? -1;
	return index === -1 ? fallback : index;
}

function itemMode(
	item: ApplicationMenuItemConfig,
	os: SupportedOS,
	inherited: MenuMode,
): MenuMode {
	return isDivider(item) ? inherited : (item[os]?.mode ?? inherited);
}

function shownIn(mode: MenuMode, surface: "native" | "webview"): boolean {
	return mode === surface || mode === "both";
}

/**
 * The items shown in the native menu or the webview menu on an OS. `mode` is
 * the menu's mode there, which items inherit unless they override it.
 */
export function placeItems(
	items: readonly ApplicationMenuItemConfig[],
	os: SupportedOS,
	surface: "native" | "webview",
	mode: MenuMode,
): ApplicationMenuItemConfig[] {
	const result: ApplicationMenuItemConfig[] = [];
	items.forEach((item, index) => {
		if (isDivider(item)) {
			result.push(item);
			return;
		}
		const resolved = itemMode(item, os, mode);
		if (item.submenu) {
			const submenu = placeItems(item.submenu, os, surface, resolved);
			const empty = !hasItems(item.submenu) && shownIn(resolved, surface);
			if (hasItems(submenu) || empty)
				result.push(copyItem(item, { submenu }, index));
		} else if (shownIn(resolved, surface)) {
			result.push(copyItem(item, {}, index));
		}
	});
	return tidyDividers(result);
}
