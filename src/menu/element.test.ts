// @vitest-environment happy-dom
import { createMenu } from "../core.ts";
import "../menu.ts";
import type { ApplicationMenuItemConfig } from "../shared/types.ts";
import { MENU_STATE_MESSAGE } from "../shared/types.ts";
import {
	allWebview,
	createFakeElectrobun,
	createRPCPair,
} from "../test-utils.ts";
import type { ElectrobunMenuElement, MenuSelectEvent } from "./element.ts";

const items: ApplicationMenuItemConfig[] = [
	{
		label: "&File",
		submenu: [
			{ label: "&New", action: "new", accelerator: "CmdOrCtrl+N" },
			{
				label: "&Open Recent",
				submenu: [{ label: "a.txt", action: "open", data: "a" }],
			},
			{ type: "divider" },
			{ label: "Hidden", action: "hidden", hidden: true },
			{
				label: "Disabled",
				action: "disabled",
				enabled: false,
				accelerator: "CmdOrCtrl+D",
			},
			{ label: "Checked", action: "checked", checked: true, tooltip: "A tip" },
		],
	},
	{ label: "&Edit", submenu: [{ role: "undo" }, { role: "copy" }] },
	{ label: "&Help", action: "help" },
];

function mount(setup: (el: ElectrobunMenuElement) => void = () => {}) {
	const el = document.createElement("electrobun-menu");
	el.os = "win";
	el.mode = "webview";
	el.items = items;
	setup(el);
	document.body.append(el);
	return el;
}

// biome-ignore lint/style/noNonNullAssertion: tests
const shadow = (el: ElectrobunMenuElement) => el.shadowRoot!;
const barItems = (el: ElectrobunMenuElement) => [
	...shadow(el).querySelectorAll<HTMLElement>('[part~="bar-item"]'),
];
const menus = (el: ElectrobunMenuElement) => [
	...shadow(el).querySelectorAll<HTMLElement>('[part~="menu"]'),
];
const menuItems = (menu: HTMLElement | undefined) => [
	...(menu?.querySelectorAll<HTMLElement>('[part~="item"]') ?? []),
];
const highlighted = (el: ElectrobunMenuElement) =>
	[...shadow(el).querySelectorAll<HTMLElement>('[part~="highlighted"]')].map(
		(node) => node.querySelector('[part="label"]')?.textContent,
	);

function key(
	type: "keydown" | "keyup",
	key: string,
	init: KeyboardEventInit = {},
) {
	const event = new KeyboardEvent(type, {
		key,
		bubbles: true,
		cancelable: true,
		...init,
	});
	document.body.dispatchEvent(event);
	return event;
}

function press(key_: string, init: KeyboardEventInit = {}) {
	return key("keydown", key_, init);
}

function pointer(target: Element, type: string) {
	target.dispatchEvent(
		new PointerEvent(type, { bubbles: true, cancelable: true, button: 0 }),
	);
}

function selections(el: ElectrobunMenuElement) {
	const events: MenuSelectEvent[] = [];
	el.addEventListener("menuselect", (event) => {
		events.push(event);
		event.preventDefault();
	});
	return events;
}

afterEach(() => {
	document.body.replaceChildren();
});

describe("<electrobun-menu>", () => {
	it("renders the bar in webview mode and hides itself otherwise", () => {
		const el = mount();
		expect(el.getAttribute("resolved-mode")).toBe("webview");
		expect(barItems(el).map((node) => node.textContent)).toEqual([
			"File",
			"Edit",
			"Help",
		]);
		expect(
			barItems(el)[0]?.querySelector('[part="mnemonic"]')?.textContent,
		).toBe("F");

		el.mode = "native";
		expect(el.getAttribute("resolved-mode")).toBe("native");
		expect(getComputedStyle(el).display).toBe("none");
	});

	it("resolves the mode from config and the OS when none is forced", () => {
		const el = mount((menu) => {
			menu.mode = null;
			menu.os = "macos";
		});
		expect(el.resolvedMode).toBe("native");
		el.os = "linux";
		expect(el.resolvedMode).toBe("webview");
		el.config = { linux: { mode: "none" } };
		expect(el.resolvedMode).toBe("none");
	});

	it("opens menus with the pointer and renders item states", () => {
		const el = mount();
		pointer(barItems(el)[0] as HTMLElement, "pointerdown");
		expect(el.open).toBe(true);
		const rows = menuItems(menus(el)[0]);
		expect(
			rows.map((row) => row.querySelector('[part="label"]')?.textContent),
		).toEqual(["New", "Open Recent", "Disabled", "Checked"]);
		expect(rows[0]?.querySelector('[part="accelerator"]')?.textContent).toBe(
			"Ctrl+N",
		);
		expect(rows[1]?.querySelector('[part="submenu-arrow"]')?.textContent).toBe(
			"›",
		);
		expect(rows[2]?.getAttribute("part")).toContain("disabled");
		expect(rows[3]?.getAttribute("role")).toBe("menuitemcheckbox");
		expect(rows[3]?.title).toBe("A tip");
		expect(menus(el)[0]?.querySelectorAll('[part="separator"]')).toHaveLength(
			1,
		);

		pointer(barItems(el)[1] as HTMLElement, "pointerover");
		expect(
			menuItems(menus(el)[0]).map(
				(row) => row.querySelector('[part="label"]')?.textContent,
			),
		).toEqual(["Undo", "Copy"]);
		expect(
			menuItems(menus(el)[0])[0]?.querySelector('[part="accelerator"]')
				?.textContent,
		).toBe("Ctrl+Z");

		pointer(document.body, "pointerdown");
		expect(el.open).toBe(false);
	});

	it("dispatches a cancelable menuselect with the item, path and data", () => {
		const el = mount();
		const events = selections(el);
		pointer(barItems(el)[0] as HTMLElement, "pointerdown");
		(menuItems(menus(el)[0])[1] as HTMLElement).click();
		(menuItems(menus(el)[1])[0] as HTMLElement).click();
		expect(events[0]?.detail).toMatchObject({
			path: [0, 1, 0],
			action: "open",
			source: "pointer",
			item: { data: "a" },
		});
		expect(el.open).toBe(false);

		(barItems(el)[2] as HTMLElement).click();
		expect(events[1]?.detail).toMatchObject({ path: [2], action: "help" });

		pointer(barItems(el)[0] as HTMLElement, "pointerdown");
		(menuItems(menus(el)[0])[2] as HTMLElement).click();
		expect(events).toHaveLength(2);
	});

	it("navigates with the keyboard after Alt, with mnemonics", () => {
		const el = mount();
		const events = selections(el);
		press("Alt");
		key("keyup", "Alt");
		expect(el.hasAttribute("active")).toBe(true);
		expect(el.hasAttribute("show-mnemonics")).toBe(true);
		expect(highlighted(el)).toEqual(["File"]);

		press("ArrowRight");
		expect(highlighted(el)).toEqual(["Edit"]);
		press("ArrowLeft");
		press("ArrowDown");
		expect(highlighted(el)).toEqual(["File", "New"]);
		press("ArrowDown");
		press("ArrowRight");
		expect(menus(el)).toHaveLength(2);
		expect(highlighted(el)).toEqual(["File", "Open Recent", "a.txt"]);
		press("ArrowLeft");
		expect(menus(el)).toHaveLength(1);
		press("ArrowDown");
		expect(highlighted(el)).toEqual(["File", "Checked"]);
		press("Escape");
		expect(el.open).toBe(false);
		expect(el.hasAttribute("active")).toBe(true);
		press("Escape");
		expect(el.hasAttribute("active")).toBe(false);

		press("f", { altKey: true });
		expect(el.open).toBe(true);
		press("n");
		expect(events[0]?.detail).toMatchObject({
			action: "new",
			source: "keyboard",
		});
	});

	it("handles registered accelerators and skips disabled ones", () => {
		const el = mount();
		const events = selections(el);
		const event = press("n", { ctrlKey: true });
		expect(event.defaultPrevented).toBe(true);
		expect(events[0]?.detail).toMatchObject({
			action: "new",
			source: "accelerator",
		});

		expect(press("d", { ctrlKey: true }).defaultPrevented).toBe(false);
		// Default edit shortcuts stay with the browser.
		expect(press("z", { ctrlKey: true }).defaultPrevented).toBe(false);
		expect(events).toHaveLength(1);
	});

	it("unregisters accelerators when disconnected or not in webview mode", () => {
		const el = mount();
		const events = selections(el);
		el.mode = "native";
		press("n", { ctrlKey: true });
		el.mode = "webview";
		el.remove();
		press("n", { ctrlKey: true });
		expect(events).toHaveLength(0);
	});

	it("respects alt-key and autohide", () => {
		const el = mount((menu) => {
			menu.autohide = true;
		});
		expect(getComputedStyle(el).display).toBe("none");
		press("Alt");
		key("keyup", "Alt");
		expect(getComputedStyle(el).display).not.toBe("none");
		press("Escape");

		el.altKey = "off";
		press("Alt");
		key("keyup", "Alt");
		expect(el.hasAttribute("active")).toBe(false);
	});

	it("uses role handlers before built-in role behavior", () => {
		const el = mount();
		const undo = vi.fn();
		el.roleHandlers = { undo };
		pointer(barItems(el)[1] as HTMLElement, "pointerdown");
		(menuItems(menus(el)[0])[0] as HTMLElement).click();
		expect(undo).toHaveBeenCalledWith(
			expect.objectContaining({ role: "undo", path: [1, 0] }),
		);
	});

	it("syncs with createMenu over RPC and forwards clicks to the main process", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(fake.electrobun, items, allWebview);
		const [main, view] = createRPCPair();
		menu.attach(main);
		const clicked = vi.fn();
		menu.on("application-menu-clicked", clicked);

		const el = document.createElement("electrobun-menu");
		expect(el.resolvedMode).toBe("webview");
		el.rpc = view;
		expect(el.resolvedMode).toBe("none");
		document.body.append(el);
		expect(el.resolvedMode).toBe("webview");
		expect(barItems(el)).toHaveLength(3);

		press("n", { ctrlKey: el.os !== "macos", metaKey: el.os === "macos" });
		expect(clicked).toHaveBeenCalledTimes(1);
		expect(clicked.mock.calls[0]?.[0].data).toMatchObject({ action: "new" });

		menu.setApplicationMenu([{ label: "Replaced", submenu: [] }]);
		expect(barItems(el).map((node) => node.textContent)).toEqual(["Replaced"]);
	});

	it("leaves shortcuts owned by the native menu or the OS unregistered", () => {
		const [main, view] = createRPCPair();
		const el = document.createElement("electrobun-menu");
		el.os = "win";
		el.rpc = view;
		document.body.append(el);
		const selected = selections(el);
		main.send(MENU_STATE_MESSAGE, {
			version: 0,
			os: "win",
			mode: "webview",
			items: [
				{
					type: "normal",
					label: "File",
					action: "",
					enabled: true,
					checked: false,
					hidden: false,
					submenu: [
						{
							type: "normal",
							label: "New",
							action: "new",
							enabled: true,
							checked: false,
							hidden: false,
							accelerator: "CmdOrCtrl+N",
							nativeAccelerator: true,
						},
						{
							type: "normal",
							label: "Save",
							action: "save",
							enabled: true,
							checked: false,
							hidden: false,
							accelerator: "CmdOrCtrl+S",
						},
						{
							type: "normal",
							label: "E&xit",
							role: "quit",
							enabled: true,
							checked: false,
							hidden: false,
							accelerator: "Alt+F4",
						},
					],
				},
			],
		});

		press("n", { ctrlKey: true });
		press("F4", { altKey: true });
		expect(selected).toHaveLength(0);
		press("s", { ctrlKey: true });
		expect(selected.map((event) => event.detail.action)).toEqual(["save"]);
		// Native-owned and OS shortcuts are still shown.
		pointer(barItems(el)[0] as HTMLElement, "pointerdown");
		expect(shadow(el).textContent).toContain("Alt+F4");
		expect(shadow(el).textContent).toContain("Ctrl+N");
	});

	it("shows only the items placed in the webview, reporting original paths", () => {
		const native = {
			label: "Native",
			action: "native",
			macos: { mode: "native" },
		} as const;
		const shared = { label: "Shared", action: "shared" };
		const el = mount((menu) => {
			menu.os = "macos";
			menu.items = [
				{ label: "Debug", submenu: [native, shared] },
				{ label: "Mac only", submenu: [], win: { mode: "none" } },
			];
		});
		expect(barItems(el).map((node) => node.textContent)).toEqual([
			"Debug",
			"Mac only",
		]);
		const selected = selections(el);
		pointer(barItems(el)[0] as HTMLElement, "pointerdown");
		const [item] = menuItems(menus(el)[0]);
		expect(item?.textContent).toContain("Shared");
		item?.click();
		expect(selected[0]?.detail).toMatchObject({
			path: [0, 1],
			action: "shared",
		});
		expect(selected[0]?.detail.item).toBe(shared);

		el.os = "win";
		expect(barItems(el).map((node) => node.textContent)).toEqual(["Debug"]);
	});
});
