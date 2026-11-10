import { standardMenu } from "./preset.ts";
import { placeItems } from "./shared/placement.ts";
import type { ApplicationMenuItemConfig } from "./shared/types.ts";

const labels = (items: readonly ApplicationMenuItemConfig[]): unknown[] =>
	items.map((item) => {
		if (!("label" in item || "role" in item)) return "-";
		const name =
			("label" in item && item.label) || ("role" in item && item.role);
		return item.submenu ? [name, labels(item.submenu)] : name;
	});

const top = (items: readonly ApplicationMenuItemConfig[]) =>
	items.map((item) => ("label" in item ? item.label : "-"));

const save = { label: "&Save", action: "save", accelerator: "CmdOrCtrl+S" };

describe("standardMenu", () => {
	it("lays out macOS menus with an app menu, Window and Help", () => {
		const menu = standardMenu({ appName: "Notes", file: [save] })({
			os: "macos",
			mode: "native",
		});
		expect(labels(menu)).toEqual([
			[
				"Notes",
				[
					"About Notes",
					"-",
					"Hide Notes",
					"hideOthers",
					"showAll",
					"-",
					"Quit Notes",
				],
			],
			["File", ["&Save", "-", "Close Window"]],
			[
				"Edit",
				[
					"undo",
					"redo",
					"-",
					"cut",
					"copy",
					"paste",
					"pasteAndMatchStyle",
					"delete",
					"selectAll",
					"-",
					["Speech", ["startSpeaking", "stopSpeaking"]],
				],
			],
			["View", ["Enter Full Screen"]],
			["Window", ["minimize", "zoom", "-", "bringAllToFront"]],
		]);
	});

	it("lays out Windows and Linux menus with Exit, About and their shortcuts", () => {
		const win = standardMenu({ file: [save] })({ os: "win", mode: "webview" });
		expect(top(win)).toEqual(["&File", "&Edit", "&View", "&Help"]);
		expect(win[0]).toMatchObject({
			submenu: [
				save,
				{ type: "divider" },
				{ role: "close" },
				{ type: "divider" },
				{ role: "quit", label: "E&xit", accelerator: "Alt+F4" },
			],
		});
		expect(win[1]).toMatchObject({
			submenu: expect.arrayContaining([
				{ role: "redo", label: "&Redo", accelerator: "CmdOrCtrl+Y" },
			]),
		});
		const linux = standardMenu()({ os: "linux", mode: "webview" });
		expect(linux[0]).toMatchObject({
			submenu: expect.arrayContaining([
				{ role: "quit", label: "&Quit", accelerator: "CmdOrCtrl+Q" },
			]),
		});
	});

	it("drops menus, positions slot items and adds extra menus", () => {
		const menu = standardMenu({
			edit: false,
			view: { items: [save], position: "end" },
			window: [{ label: "Tile", action: "tile" }],
			menus: [{ label: "Tools", submenu: [] }],
		})({ os: "linux", mode: "webview" });
		expect(top(menu)).toEqual(["&File", "&View", "Tools", "&Window", "&Help"]);
		expect(labels(menu)[1]).toEqual(["&View", ["&Full Screen", "-", "&Save"]]);
	});

	it("keeps standard menus in the macOS menu bar in webview and none modes", () => {
		const options = {
			file: [
				save,
				{
					label: "Print",
					action: "print",
					macos: { mode: "webview" as const },
				},
			],
			help: {
				items: [{ label: "Docs", action: "docs" }],
				macos: { mode: "webview" as const },
			},
		};
		const webview = standardMenu(options)({ os: "macos", mode: "webview" });
		expect(top(placeItems(webview, "macos", "native", "webview"))).toEqual([
			"App",
			"File",
			"Edit",
			"View",
			"Window",
		]);
		expect(
			labels(placeItems(webview, "macos", "native", "webview"))[1],
		).toEqual(["File", ["&Save", "-", "Close Window"]]);
		expect(top(placeItems(webview, "macos", "webview", "webview"))).toContain(
			"Help",
		);

		const none = standardMenu({ file: [save] })({ os: "macos", mode: "none" });
		expect(top(placeItems(none, "macos", "native", "none"))).toContain("File");
		expect(placeItems(none, "macos", "webview", "none")).toEqual([]);
		// Explicit overrides still apply in "none" mode.
		const overridden = standardMenu(options)({ os: "macos", mode: "none" });
		expect(top(placeItems(overridden, "macos", "webview", "none"))).toEqual([
			"File",
			"Help",
		]);
	});
});
