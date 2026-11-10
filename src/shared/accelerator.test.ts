import {
	formatAccelerator,
	matchesAccelerator,
	parseAccelerator,
} from "./accelerator.ts";

function key(
	key: string,
	init: Partial<
		Record<"code" | "meta" | "ctrl" | "alt" | "shift", string | boolean>
	> = {},
) {
	return {
		key,
		code: typeof init.code === "string" ? init.code : "",
		metaKey: Boolean(init.meta),
		ctrlKey: Boolean(init.ctrl),
		altKey: Boolean(init.alt),
		shiftKey: Boolean(init.shift),
	};
}

describe("parseAccelerator", () => {
	it("parses modifiers case-insensitively and lowercases the key", () => {
		expect(parseAccelerator("CommandOrControl+Shift+T")).toMatchObject({
			key: "t",
			commandOrControl: true,
			shift: true,
			bare: false,
		});
		expect(parseAccelerator("cmd+OPTION+F5")).toMatchObject({
			key: "f5",
			command: true,
			alt: true,
		});
	});

	it("treats a bare key as bare and handles a literal plus", () => {
		expect(parseAccelerator("s")).toMatchObject({ key: "s", bare: true });
		expect(parseAccelerator("Ctrl++")).toMatchObject({
			key: "+",
			control: true,
		});
		expect(parseAccelerator("")).toBeUndefined();
	});
});

describe("matchesAccelerator", () => {
	// biome-ignore lint/style/noNonNullAssertion: fixtures
	const parse = (value: string) => parseAccelerator(value)!;

	it("maps CmdOrCtrl and bare keys to Cmd on macOS and Ctrl elsewhere", () => {
		expect(
			matchesAccelerator(
				parse("CmdOrCtrl+S"),
				key("s", { meta: true }),
				"macos",
			),
		).toBe(true);
		expect(
			matchesAccelerator(
				parse("CmdOrCtrl+S"),
				key("s", { ctrl: true }),
				"macos",
			),
		).toBe(false);
		expect(
			matchesAccelerator(parse("CmdOrCtrl+S"), key("s", { ctrl: true }), "win"),
		).toBe(true);
		expect(
			matchesAccelerator(parse("s"), key("s", { ctrl: true }), "linux"),
		).toBe(true);
		expect(matchesAccelerator(parse("s"), key("s"), "linux")).toBe(false);
	});

	it("requires modifiers to match exactly", () => {
		expect(
			matchesAccelerator(
				parse("Ctrl+S"),
				key("s", { ctrl: true, shift: true }),
				"win",
			),
		).toBe(false);
		expect(
			matchesAccelerator(
				parse("Ctrl+Shift+S"),
				key("S", { ctrl: true, shift: true }),
				"win",
			),
		).toBe(true);
	});

	it("falls back to the physical key when a modifier changes the character", () => {
		expect(
			matchesAccelerator(
				parse("Cmd+Alt+N"),
				key("˜", { code: "KeyN", meta: true, alt: true }),
				"macos",
			),
		).toBe(true);
		expect(
			matchesAccelerator(
				parse("Ctrl+Shift+1"),
				key("!", { code: "Digit1", ctrl: true, shift: true }),
				"win",
			),
		).toBe(true);
	});

	it("matches named keys and doesn't demand Shift for symbols", () => {
		expect(matchesAccelerator(parse("F11"), key("F11"), "win")).toBe(true);
		expect(
			matchesAccelerator(parse("F11"), key("F11", { meta: true }), "macos"),
		).toBe(true);
		expect(
			matchesAccelerator(parse("Alt+F4"), key("F4", { alt: true }), "win"),
		).toBe(true);
		expect(
			matchesAccelerator(
				parse("CmdOrCtrl+Plus"),
				key("+", { ctrl: true, shift: true }),
				"win",
			),
		).toBe(true);
		expect(
			matchesAccelerator(
				parse("Ctrl+PageDown"),
				key("PageDown", { ctrl: true }),
				"linux",
			),
		).toBe(true);
	});
});

describe("formatAccelerator", () => {
	const format = (value: string, os: "macos" | "win" | "linux") => {
		const accelerator = parseAccelerator(value);
		if (!accelerator) throw new Error(`invalid accelerator ${value}`);
		return formatAccelerator(accelerator, os);
	};

	it("formats like native menus", () => {
		expect(format("CmdOrCtrl+Shift+S", "macos")).toBe("⇧⌘S");
		expect(format("CmdOrCtrl+Shift+S", "win")).toBe("Ctrl+Shift+S");
		expect(format("Ctrl+Alt+Delete", "macos")).toBe("⌃⌥⌦");
		expect(format("q", "linux")).toBe("Ctrl+Q");
		expect(format("Super+Enter", "linux")).toBe("Super+Enter");
		expect(format("Alt+F4", "win")).toBe("Alt+F4");
	});
});
