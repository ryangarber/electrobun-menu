import Electrobun, {
	BrowserView,
	BrowserWindow,
	Updater,
} from "electrobun/main";
import {
	createMenu,
	type MenuMode,
	standardMenu,
} from "../../../../src/index.ts";
import type { FixtureRPC } from "../shared/rpc.ts";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

async function getMainViewUrl(): Promise<string> {
	const channel = await Updater.localInfo.channel();
	if (channel === "dev") {
		try {
			await fetch(DEV_SERVER_URL, { method: "HEAD" });
			console.log(`HMR enabled: Using Vite dev server at ${DEV_SERVER_URL}`);
			return DEV_SERVER_URL;
		} catch {
			console.log(
				"Vite dev server not running. Run 'hutch run dev:hmr' for HMR support.",
			);
		}
	}
	return "views://mainview/index.html";
}

const url = await getMainViewUrl();

const rpc = BrowserView.defineRPC<FixtureRPC>({ handlers: {} });

const mainWindow = new BrowserWindow({
	title: "electrobun-fixture",
	url,
	rpc,
	frame: {
		width: 900,
		height: 700,
		x: 200,
		y: 200,
	},
});

// Lets the fixture preview other modes on macOS: MENU_MODE=webview|both|none
const macosMode = (process.env.MENU_MODE as MenuMode | undefined) ?? "native";
let wordWrap = true;

const fileItems = [
	{ label: "&New Window", action: "new-window", accelerator: "CmdOrCtrl+N" },
	{ label: "&Open…", action: "open", accelerator: "CmdOrCtrl+O" },
	{
		label: "Open &Recent",
		submenu: [
			{
				label: "notes.md",
				action: "open-recent",
				data: { path: "~/notes.md" },
			},
			{
				label: "todo.txt",
				action: "open-recent",
				data: { path: "~/todo.txt" },
			},
		],
	},
	{ type: "divider" as const },
	{ label: "&Save", action: "save", accelerator: "CmdOrCtrl+S" },
	{ label: "Save &As…", action: "save-as", accelerator: "CmdOrCtrl+Shift+S" },
];

const items = () =>
	standardMenu({
		appName: "electrobun-fixture",
		version: "0.1.0",
		file: fileItems,
		view: [
			{
				label: "&Word Wrap",
				action: "toggle-wrap",
				checked: wordWrap,
				accelerator: "Alt+Z",
				// Only in the window's menu, even while macOS mirrors View.
				macos: { mode: "webview" },
			},
			{ label: "Zoom &In", action: "zoom-in", accelerator: "CmdOrCtrl+Plus" },
			{ label: "Zoom &Out", action: "zoom-out", accelerator: "CmdOrCtrl+-" },
			{ label: "Developer Tools", action: "devtools", enabled: false },
		],
		menus: [
			{
				label: "&Debug",
				submenu: [
					// Only in the macOS menu bar, and nowhere on other OSes.
					{
						label: "Reload Menu",
						action: "reload-menu",
						macos: { mode: "native" },
						win: { mode: "none" },
						linux: { mode: "none" },
					},
					{ label: "Log State", action: "log-state" },
				],
			},
		],
	});

const menu = createMenu(Electrobun, items(), { macos: { mode: macosMode } });
menu.attach(mainWindow);

menu.on("application-menu-clicked", (event) => {
	const { action, data } = event.data;
	console.log("menu clicked", action, data);
	if (action === "toggle-wrap" || action === "reload-menu") {
		if (action === "toggle-wrap") wordWrap = !wordWrap;
		menu.setApplicationMenu(items());
	}
	rpc.send.menuClicked({ action, data });
});

console.log(`Started with ${menu.mode} menu`);
