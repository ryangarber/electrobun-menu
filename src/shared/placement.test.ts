import { originOf, placeItems, sourceIndexOf } from "./placement.ts";
import type { ApplicationMenuItemConfig } from "./types.ts";

const labels = (items: readonly ApplicationMenuItemConfig[]): unknown[] =>
	items.map((item) =>
		"label" in item
			? item.submenu
				? [item.label, labels(item.submenu)]
				: item.label
			: "-",
	);

const items: ApplicationMenuItemConfig[] = [
	{
		label: "File",
		macos: { mode: "both" },
		submenu: [
			{ label: "New", action: "new" },
			{ type: "divider" },
			{ label: "Print", action: "print", macos: { mode: "webview" } },
		],
	},
	{
		label: "Debug",
		submenu: [
			{ label: "Reload", action: "reload", macos: { mode: "native" } },
			{ label: "Inspect", action: "inspect", linux: { mode: "none" } },
		],
	},
];

describe("placeItems", () => {
	it("inherits modes from parents and lets items override them per OS", () => {
		expect(labels(placeItems(items, "macos", "native", "webview"))).toEqual([
			["File", ["New"]],
			["Debug", ["Reload"]],
		]);
		expect(labels(placeItems(items, "macos", "webview", "webview"))).toEqual([
			["File", ["New", "-", "Print"]],
			["Debug", ["Inspect"]],
		]);
		expect(labels(placeItems(items, "linux", "webview", "webview"))).toEqual([
			["File", ["New", "-", "Print"]],
			["Debug", ["Reload"]],
		]);
		expect(placeItems(items, "linux", "native", "webview")).toEqual([]);
	});

	it("keeps intentionally empty submenus and drops ones emptied by placement", () => {
		const menu: ApplicationMenuItemConfig[] = [
			{ label: "Help", submenu: [] },
			{
				label: "Gone",
				submenu: [{ label: "A", action: "a", macos: { mode: "native" } }],
			},
		];
		expect(labels(placeItems(menu, "macos", "webview", "webview"))).toEqual([
			["Help", []],
		]);
	});

	it("maps copies back to the original items and their indices", () => {
		const placed = placeItems(items, "macos", "native", "webview");
		const debug = placed[1];
		const reload = debug && "submenu" in debug ? debug.submenu?.[0] : undefined;
		expect(originOf(debug as object)).toBe(items[1]);
		expect(reload && originOf(reload)).toBe(
			"submenu" in (items[1] as object)
				? (items[1] as { submenu: ApplicationMenuItemConfig[] }).submenu[0]
				: undefined,
		);
		expect(reload && sourceIndexOf(reload, -1)).toBe(0);
		const file = placeItems(items, "macos", "webview", "webview")[0];
		const print = file && "submenu" in file ? file.submenu?.[2] : undefined;
		expect(print && sourceIndexOf(print, -1)).toBe(2);
	});
});
