import type { ApplicationMenuItemConfig, UntypedRPC } from "./shared/types.ts";
import type { ElectrobunLike, WindowLike } from "./types.ts";

type Listener = (payload: unknown) => void;

export type FakeRPC = UntypedRPC & {
	sent: { message: string; payload: unknown }[];
};

/** Two connected RPC endpoints that deliver JSON copies synchronously, like Electrobun's transport. */
export function createRPCPair(): [FakeRPC, FakeRPC] {
	const create = () => {
		const listeners = new Map<string, Set<Listener>>();
		const endpoint = {
			sent: [] as { message: string; payload: unknown }[],
			peer: undefined as
				| undefined
				| { deliver: (message: string, payload: unknown) => void },
			deliver(message: string, payload: unknown) {
				for (const listener of listeners.get(message) ?? []) {
					listener(JSON.parse(JSON.stringify(payload ?? null)));
				}
			},
			send(message: string, payload?: unknown) {
				endpoint.sent.push({ message, payload });
				endpoint.peer?.deliver(message, payload);
			},
			addMessageListener(message: string, listener: Listener) {
				const set = listeners.get(message) ?? new Set();
				set.add(listener);
				listeners.set(message, set);
			},
			removeMessageListener(message: string, listener: Listener) {
				listeners.get(message)?.delete(listener);
			},
		};
		return endpoint;
	};
	const main = create();
	const view = create();
	main.peer = view;
	view.peer = main;
	return [main, view];
}

export function createFakeWindow() {
	const state = {
		maximized: false,
		fullScreen: false,
		closed: false,
		minimized: false,
	};
	const window: WindowLike = {
		close: () => {
			state.closed = true;
		},
		hide: () => {},
		minimize: () => {
			state.minimized = true;
		},
		maximize: () => {
			state.maximized = true;
		},
		unmaximize: () => {
			state.maximized = false;
		},
		isMaximized: () => state.maximized,
		setFullScreen: (value) => {
			state.fullScreen = value;
		},
		isFullScreen: () => state.fullScreen,
	};
	return { window, state };
}

export function createFakeElectrobun() {
	const nativeMenus: ApplicationMenuItemConfig[][] = [];
	const nativeHandlers: ((event: unknown) => void)[] = [];
	const windows = new Map<number, WindowLike>();
	const windowEvents = new Map<string, Set<(event: unknown) => void>>();
	const messageBoxes: unknown[] = [];
	let quits = 0;
	const electrobun: ElectrobunLike = {
		ApplicationMenu: {
			setApplicationMenu: (menu) => {
				nativeMenus.push(menu);
			},
			on: (_name, handler) => {
				nativeHandlers.push(handler);
			},
		},
		BrowserWindow: { getById: (id) => windows.get(id) },
		Utils: {
			quit: () => {
				quits++;
			},
			showMessageBox: (options) => {
				messageBoxes.push(options);
			},
		},
		events: {
			on: (name, handler) => {
				const set = windowEvents.get(name) ?? new Set();
				set.add(handler);
				windowEvents.set(name, set);
			},
			off: (name, handler) => {
				windowEvents.get(name)?.delete(handler);
			},
		},
	};
	return {
		electrobun,
		nativeMenus,
		windows,
		messageBoxes,
		get quits() {
			return quits;
		},
		/** Emits Electrobun's global window `focus` or `blur` event. */
		windowEvent(name: "focus" | "blur", id: number) {
			for (const handler of windowEvents.get(name) ?? []) {
				handler({ name, data: { id } });
			}
		},
		clickNative(action: string, data?: unknown) {
			for (const handler of nativeHandlers) {
				handler({
					name: "application-menu-clicked",
					data: { id: 0, action, data },
				});
			}
		},
	};
}

export const allWebview = {
	macos: { mode: "webview" },
	win: { mode: "webview" },
	linux: { mode: "webview" },
} as const;

export const allNative = {
	macos: { mode: "native" },
	win: { mode: "native" },
	linux: { mode: "native" },
} as const;
