import { buildNativeMenu, macConventions } from "./native.ts";
import type { ApplicationMenuItemConfig } from "./shared/types.ts";

const labels = (items: readonly ApplicationMenuItemConfig[]): unknown[] =>
	items.map((item) => {
		if (!("label" in item || "role" in item)) return "-";
		const name =
			("label" in item && item.label) || ("role" in item && item.role);
		return item.submenu ? [name, labels(item.submenu)] : name;
	});

describe("macConventions", () => {
	it("adds app, Edit and Window menus, moving about and quit and stripping mnemonics", () => {
		const result = macConventions([
			{
				label: "&File",
				submenu: [
					{ label: "&Save", action: "save" },
					{ type: "divider" },
					{ role: "quit", label: "E&xit", accelerator: "Alt+F4" },
				],
			},
			{
				label: "&Help",
				submenu: [{ role: "about", label: "&About Notes" }],
			},
			{ label: "Rock && Roll", action: "rock" },
		]);
		expect(labels(result)).toEqual([
			[
				"App",
				["About Notes", "-", "hide", "hideOthers", "showAll", "-", "quit"],
			],
			["File", ["Save"]],
			["Edit", ["undo", "redo", "-", "cut", "copy", "paste", "selectAll"]],
			"Rock & Roll",
			["Window", ["minimize", "zoom", "-", "bringAllToFront"]],
		]);
		// Quit loses its other-OS label but keeps a custom accelerator.
		const quit =
			result[0] && "submenu" in result[0]
				? result[0].submenu?.at(-1)
				: undefined;
		expect(quit).toEqual({ role: "quit", accelerator: "Alt+F4" });
	});

	it("keeps an existing app, Edit and Window menu and moves the app menu first", () => {
		const result = macConventions([
			{ label: "Edit", submenu: [{ role: "copy" }] },
			{ label: "Notes", role: "appMenu", submenu: [{ role: "quit" }] },
			{ label: "Window", submenu: [{ role: "minimize" }] },
		]);
		expect(labels(result)).toEqual([
			["Notes", ["quit"]],
			["Edit", ["copy"]],
			["Window", ["minimize"]],
		]);
	});
});

describe("buildNativeMenu", () => {
	const items: ApplicationMenuItemConfig[] = [
		{
			label: "&File",
			submenu: [
				{ label: "Save", action: "save", accelerator: "CmdOrCtrl+S" },
				{ label: "Web", action: "web", macos: { mode: "webview" } },
				{ role: "close" },
			],
		},
	];

	it("leaves non-macOS menus as given, minus placement overrides", () => {
		const { items: native } = buildNativeMenu(items, {
			os: "win",
			mode: "native",
			handledRoles: new Set(),
		});
		expect(native).toEqual([
			{
				label: "&File",
				submenu: [
					{ label: "Save", action: "save", accelerator: "CmdOrCtrl+S" },
					{ label: "Web", action: "web" },
					{ role: "close" },
				],
			},
		]);
	});

	it("records accelerator owners and turns handled roles into actions", () => {
		const menu = buildNativeMenu(items, {
			os: "macos",
			mode: "native",
			handledRoles: new Set(["close"]),
		});
		const file = menu.items.find(
			(item) => "label" in item && item.label === "File",
		);
		expect(file).toEqual({
			label: "File",
			submenu: [
				{ label: "Save", action: "save", accelerator: "CmdOrCtrl+S" },
				{ label: "Close", action: "electrobun-menu:role:0" },
			],
		});
		const source = items[0] as { submenu: ApplicationMenuItemConfig[] };
		expect(menu.acceleratorOwners.has(source.submenu[0] as object)).toBe(true);
		expect(menu.roleActions.get("electrobun-menu:role:0")).toEqual({
			role: "close",
			item: source.submenu[2],
		});
	});

	it("gives macOS a basic menu even when nothing is placed natively", () => {
		const { items: native } = buildNativeMenu(items, {
			os: "macos",
			mode: "none",
			handledRoles: new Set(),
		});
		expect(labels(native).map((menu) => (menu as unknown[])[0])).toEqual([
			"App",
			"Edit",
			"Window",
		]);
		expect(
			buildNativeMenu(items, {
				os: "linux",
				mode: "webview",
				handledRoles: new Set(),
			}).items,
		).toEqual([]);
	});
});
