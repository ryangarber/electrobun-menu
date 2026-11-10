import { createMenu } from "./core.ts";
import { standardMenu } from "./preset.ts";
import {
	type ApplicationMenuItemConfig,
	MENU_READY_MESSAGE,
	MENU_SELECT_MESSAGE,
	MENU_STATE_MESSAGE,
	type MenuStatePayload,
	type SupportedOS,
} from "./shared/types.ts";
import {
	allNative,
	allWebview,
	createFakeElectrobun,
	createFakeWindow,
	createRPCPair,
} from "./test-utils.ts";

const platform = vi.hoisted(() => ({ os: "win" as SupportedOS }));
vi.mock("./utils.ts", () => ({
	get OS() {
		return platform.os;
	},
}));

beforeEach(() => {
	platform.os = "win";
});

const payload = { nested: { value: 1 } };

const items: ApplicationMenuItemConfig[] = [
	{
		label: "&File",
		submenu: [
			{
				label: "Save",
				action: "save",
				accelerator: "CmdOrCtrl+S",
				data: payload,
			},
			{ type: "divider" },
			{ role: "quit" },
		],
	},
	{
		label: "View",
		submenu: [
			{ role: "toggleFullScreen" },
			{ label: "Disabled", action: "nope", enabled: false },
		],
	},
];

describe("createMenu", () => {
	it("installs the native menu in native mode and forwards native clicks", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(fake.electrobun, items, allNative);
		expect(menu.mode).toBe("native");
		expect(fake.nativeMenus.at(-1)).toEqual(items);

		const handler = vi.fn();
		menu.on("application-menu-clicked", handler);
		fake.clickNative("save", payload);
		expect(handler).toHaveBeenCalledWith(
			expect.objectContaining({
				data: { id: 0, action: "save", data: payload },
			}),
		);
	});

	it("clears the native menu on Windows and syncs serialized items to attached views in webview mode", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(fake.electrobun, items, allWebview);
		expect(fake.nativeMenus.at(-1)).toEqual([]);

		const [main] = createRPCPair();
		menu.attach({ webview: { rpc: main } });
		const state = main.sent.at(-1)?.payload as MenuStatePayload;
		expect(main.sent.at(-1)?.message).toBe(MENU_STATE_MESSAGE);
		expect(state.mode).toBe("webview");
		expect(state.items[0]).toMatchObject({ type: "normal", label: "&File" });
		expect(state.items[0]).not.toHaveProperty("data");
		const file = state.items[0];
		expect(file?.type === "normal" && file.submenu?.[2]).toMatchObject({
			label: "Quit",
			role: "quit",
		});
	});

	it("resends state when a view reports ready and when the menu changes", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(fake.electrobun, items, allWebview);
		const [main, view] = createRPCPair();
		const states: MenuStatePayload[] = [];
		view.addMessageListener(MENU_STATE_MESSAGE, (state) =>
			states.push(state as MenuStatePayload),
		);
		menu.attach(main);

		view.send(MENU_READY_MESSAGE, {});
		menu.setApplicationMenu([{ label: "Only", action: "only" }]);
		expect(states).toHaveLength(3);
		expect(states[2]).toMatchObject({ version: 1, items: [{ label: "Only" }] });
	});

	it("emits clicks from webviews with the original data, ignoring stale and disabled items", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(fake.electrobun, items, allWebview);
		const [main, view] = createRPCPair();
		menu.attach(main);
		const handler = vi.fn();
		menu.on("application-menu-clicked", handler);

		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 0], windowId: 7 });
		expect(handler).toHaveBeenCalledTimes(1);
		const event = handler.mock.calls[0]?.[0];
		expect(event.name).toBe("application-menu-clicked");
		expect(event.data).toEqual({ id: 7, action: "save", data: payload });
		expect(event.data.data).toBe(payload);

		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [1, 1] });
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 1] });
		view.send(MENU_SELECT_MESSAGE, { version: 5, path: [0, 0] });
		view.send(MENU_SELECT_MESSAGE, { path: "nope" });
		expect(handler).toHaveBeenCalledTimes(1);
	});

	it("performs window and app roles in the main process", () => {
		const fake = createFakeElectrobun();
		const { window, state } = createFakeWindow();
		fake.windows.set(3, window);
		const menu = createMenu(fake.electrobun, items, allWebview);
		const [main, view] = createRPCPair();
		menu.attach(main);

		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [1, 0], windowId: 3 });
		expect(state.fullScreen).toBe(true);
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 2], windowId: 3 });
		expect(fake.quits).toBe(1);
	});

	it("lets role handlers override or fall through to built-ins", () => {
		const fake = createFakeElectrobun();
		const about = vi.fn();
		const quit = vi.fn(() => false);
		const menu = createMenu(
			fake.electrobun,
			[{ label: "App", submenu: [{ role: "about" }, { role: "quit" }] }],
			{ ...allWebview, roles: { about, quit } },
		);
		const [main, view] = createRPCPair();
		menu.attach(main);

		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 0], windowId: 1 });
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 1], windowId: 1 });
		expect(about).toHaveBeenCalledWith(
			expect.objectContaining({ role: "about", windowId: 1 }),
		);
		expect(quit).toHaveBeenCalled();
		expect(fake.quits).toBe(1);
	});

	it("keeps a native menu on macOS in webview mode, laid out for the Mac", () => {
		platform.os = "macos";
		const fake = createFakeElectrobun();
		createMenu(fake.electrobun, items, allWebview);
		const native = fake.nativeMenus.at(-1) ?? [];
		expect(native.map((item) => "label" in item && item.label)).toEqual([
			"App",
			"Edit",
			"Window",
		]);
		expect(native[0]).toMatchObject({
			submenu: expect.arrayContaining([
				{ role: "quit", accelerator: "CmdOrCtrl+Q" },
			]),
		});
	});

	it("places items per OS and leaves shortcuts of native items to the native menu", () => {
		platform.os = "macos";
		const fake = createFakeElectrobun();
		const placed: ApplicationMenuItemConfig[] = [
			{
				label: "&File",
				submenu: [
					{
						label: "&New",
						action: "new",
						accelerator: "CmdOrCtrl+N",
						macos: { mode: "both" },
					},
					{
						label: "Native only",
						action: "native-only",
						macos: { mode: "native" },
						win: { mode: "none" },
					},
					{ label: "Webview only", action: "webview-only", data: payload },
				],
			},
		];
		const menu = createMenu(fake.electrobun, placed, allWebview);
		const native = fake.nativeMenus.at(-1) ?? [];
		const nativeFile = native.find(
			(item) => "label" in item && item.label === "File",
		);
		expect(nativeFile).toEqual({
			label: "File",
			submenu: [
				{ label: "New", action: "new", accelerator: "CmdOrCtrl+N" },
				{ label: "Native only", action: "native-only" },
			],
		});

		const [main, view] = createRPCPair();
		menu.attach(main);
		const state = main.sent.at(-1)?.payload as MenuStatePayload;
		const file = state.items[0];
		expect(file?.type === "normal" && file.submenu).toMatchObject([
			{ label: "&New", nativeAccelerator: true },
			{ label: "Webview only" },
		]);
		expect(file?.type === "normal" && file.submenu?.[1]).not.toHaveProperty(
			"nativeAccelerator",
		);

		// Webview paths index into the webview's items, not the original menu.
		const handler = vi.fn();
		menu.on("application-menu-clicked", handler);
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 1] });
		expect(handler.mock.calls[0]?.[0].data).toMatchObject({
			action: "webview-only",
			data: payload,
		});
	});

	it("runs role handlers for native clicks, with the focused window", () => {
		platform.os = "macos";
		const fake = createFakeElectrobun();
		const { window } = createFakeWindow();
		fake.windows.set(4, window);
		const close = vi.fn();
		createMenu(
			fake.electrobun,
			[{ label: "File", submenu: [{ role: "close" }, { role: "quit" }] }],
			{ ...allNative, roles: { close } },
		);
		const file = (fake.nativeMenus.at(-1) ?? []).find(
			(item) => "label" in item && item.label === "File",
		);
		const closeItem = file && "submenu" in file ? file.submenu?.[0] : undefined;
		expect(closeItem).toMatchObject({ label: "Close" });
		const action =
			closeItem && "action" in closeItem ? closeItem.action : undefined;
		expect(action).toMatch(/^electrobun-menu:role:/);

		fake.windowEvent("focus", 4);
		fake.clickNative(action ?? "");
		expect(close).toHaveBeenCalledWith(
			expect.objectContaining({ role: "close", windowId: 4, window }),
		);
		fake.windowEvent("blur", 4);
		fake.clickNative(action ?? "");
		expect(close).toHaveBeenLastCalledWith(
			expect.objectContaining({ windowId: undefined }),
		);
	});

	it("builds templates for the current OS and mode", () => {
		platform.os = "macos";
		const fake = createFakeElectrobun();
		const menu = createMenu(
			fake.electrobun,
			standardMenu({ appName: "Notes" }),
			allWebview,
		);
		expect(menu.items[0]).toMatchObject({
			label: "Notes",
			role: "appMenu",
			macos: { mode: "both" },
		});
		expect(fake.nativeMenus.at(-1)?.[0]).toMatchObject({ label: "Notes" });
		expect(fake.nativeMenus.at(-1)?.[0]).not.toHaveProperty("role");

		platform.os = "win";
		menu.setApplicationMenu(standardMenu());
		// The OS is resolved once, when the menu is created.
		expect(menu.items[0]).toMatchObject({ label: "App", role: "appMenu" });
	});

	it("shows the built-in About dialog for about items", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(
			fake.electrobun,
			standardMenu({ appName: "Notes", version: "1.2.0" }),
			allWebview,
		);
		const [main, view] = createRPCPair();
		menu.attach(main);
		const state = main.sent.at(-1)?.payload as MenuStatePayload;
		const help = state.items.findIndex(
			(item) => item.type === "normal" && item.label === "&Help",
		);
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [help, 0] });
		expect(fake.messageBoxes).toEqual([
			{
				type: "info",
				title: "About Notes",
				message: "Notes",
				detail: "Version 1.2.0",
			},
		]);
	});

	it("stops listening after detach and dispose", () => {
		const fake = createFakeElectrobun();
		const menu = createMenu(fake.electrobun, items, allWebview);
		const [main, view] = createRPCPair();
		const detach = menu.attach(main);
		const handler = vi.fn();
		menu.on("application-menu-clicked", handler);

		detach();
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 0] });
		menu.attach(main);
		menu.dispose();
		view.send(MENU_SELECT_MESSAGE, { version: 0, path: [0, 0] });
		expect(handler).not.toHaveBeenCalled();
	});
});
