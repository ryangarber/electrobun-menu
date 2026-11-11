# electrobun-menu

Electrobun application menus that work everywhere. Define one menu using Electrobun's `ApplicationMenuItemConfig` shape. Each platform then shows it as either a native menu or an `<electrobun-menu>` bar rendered inside your webview.

By default, macOS uses the native menu, and Windows and Linux use the webview menu. Electrobun has no native menus on Linux, and its Windows menu is limited.

## Main process

```ts
import Electrobun, { BrowserWindow } from "electrobun/main";
import { createMenu } from "electrobun-menu";

const menu = createMenu(
	Electrobun,
	[
		{
			label: "&File",
			submenu: [
				{ label: "&Save", action: "save", accelerator: "CmdOrCtrl+S" },
				{ type: "divider" },
				{ role: "quit" },
			],
		},
		{
			label: "&Edit",
			submenu: [{ role: "undo" }, { role: "redo" }, { role: "copy" }],
		},
	],
	{
		win: { mode: "webview" },
		linux: { mode: "webview" },
		macos: { mode: "native" },
	},
);

const win = new BrowserWindow({ url: "views://main/index.html" });
menu.attach(win);

// Receives clicks from the native menu and from webview menus.
menu.on("application-menu-clicked", (event) => {
	console.log(event.data.action, event.data.data);
});

// Re-render the menu (e.g. to toggle `checked`), natively or in every attached view.
menu.setApplicationMenu(nextItems);
```

The mode for each OS is `"native"`, `"webview"`, `"both"`, or `"none"`. Each attached view receives the menu without `data`, which stays in the main process: clicks report back an item path, and `event.data.data` is your original object.

Webview menus handle `quit`, `close`, `hide`, `minimize`, `zoom`, `about`, `toggleFullScreen`, `enterFullScreen`, and `exitFullScreen` in the main process. Use the `roles` option to handle any other role or to override a built-in one. A handler that returns `false` falls through to the built-in behavior. Handlers run for clicks from the native menu too: a handled role is sent to the native menu as an internal action, and `window` is the focused window.

```ts
createMenu(Electrobun, items, {
	roles: { about: ({ window }) => showAboutWindow(window) },
});
```

### Standard menus

`standardMenu()` builds the menus users expect on each OS, laid out by its conventions. Pass the result to `createMenu` or `setApplicationMenu`; it's built for the current OS and mode.

```ts
import { createMenu, standardMenu } from "electrobun-menu";

createMenu(
	Electrobun,
	standardMenu({
		appName: "Notes",
		version: "1.2.0",
		file: [{ label: "&New", action: "new", accelerator: "CmdOrCtrl+N" }],
		menus: [{ label: "&Format", submenu: formatItems }],
	}),
);
```

| Menu   | macOS                                                                           | Windows and Linux                                                          |
| ------ | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| App    | About, Hide, Hide Others, Show All, Quit                                        | (`app` items go in File, above Exit)                                       |
| File   | Close Window                                                                    | Close, Exit (Alt+F4 on Windows, shown but left to the OS; Ctrl+Q on Linux) |
| Edit   | Undo, Redo, Cut, Copy, Paste, Paste and Match Style, Delete, Select All, Speech | Undo, Redo, Cut, Copy, Paste, Delete, Select All                           |
| View   | Enter Full Screen (Ctrl+Cmd+F)                                                  | Full Screen (F11)                                                          |
| Window | Minimize, Zoom, Bring All to Front                                              | Only when given items                                                      |
| Help   | Only when given items (macOS adds Search)                                       | About                                                                      |

Each of `app`, `file`, `edit`, `view`, `window`, and `help` takes an array of your items, or `{ items, position: "start" | "end", macos?, win?, linux? }` to move them before or after the standard items and set where that menu is shown. `false` drops the menu. `menus` adds top-level menus after View. Without `standardMenu()`, a plain array works as before.

### Placing items

Any item can override where it's shown on each OS, in the same shape as the menu's config: `{ macos?: { mode }, win?: { mode }, linux?: { mode } }`. Items without an override use their parent's mode, and top-level items use the menu's. A submenu is shown wherever any of its items are.

```ts
{ label: "Reload", action: "reload", macos: { mode: "native" }, win: { mode: "none" } }
```

`"both"` puts an item in the native menu and the webview menu. Its shortcut is then handled by the native menu alone, so it fires once.

On macOS the menu bar holds Quit, Hide, the window commands and the edit commands (WKWebView's Cmd+C and Cmd+V go through it), and it's the only menu when no window is open. So in `"webview"` and `"none"` modes, `standardMenu()` keeps its menus there as well (`"both"` and `"native"`), along with the items you add to them unless you override that. Whatever ends up in the native menu on macOS is laid out the Mac way:

- if there's no app menu (an item with `role: "appMenu"`), one is added, and `about` and `quit` items move into it;
- an Edit menu is added if there are no edit roles, and a Window menu if there's no Window menu;
- `&` mnemonics are removed from labels.

## Webview

```html
<electrobun-menu></electrobun-menu>
```

```ts
import { Electroview } from "electrobun/view";
import "electrobun-menu/menu";

const rpc = Electroview.defineRPC<MyRPC>({ handlers: {} });
new Electroview({ rpc });

document.querySelector("electrobun-menu")!.rpc = rpc;
```

The element gets its items and mode from the main process over your existing RPC instance (on messages named `electrobun-menu:*`). It renders the items placed in the webview (by the mode, or by per-item overrides) and hides itself when there are none. You can also use it without the main process: set `items` (and `mode` or `config`) directly, then handle `menuselect` events yourself.

### Behavior

- **Accelerators** are registered while the menu is connected and has items, except those the native menu handles and Alt+F4 on Windows. Electrobun's rules apply: `CmdOrCtrl` is Cmd on macOS and Ctrl elsewhere. A bare key gets Cmd on macOS, and a bare letter gets Ctrl elsewhere. Default edit shortcuts (Ctrl+C and so on) are shown but left to the browser.
- **Mnemonics**: `&File` underlines F once the bar is activated from the keyboard, and Alt+F opens that menu. Write `&&` for a literal ampersand.
- **Keyboard**: on Windows and Linux, pressing and releasing Alt (or pressing F10) highlights the menu bar. The arrow keys, Enter, Space, Escape, Home, End, and typeahead all work as they do in native menus.
- **Focus** stays where it was, so edit roles (`undo`, `redo`, `cut`, `copy`, `paste`, `pasteAndMatchStyle`, `delete`, `selectAll`) apply to the field you were editing. `startSpeaking` and `stopSpeaking` use the Web Speech API.
- `label`, `action`, `role`, `tooltip`, `enabled`, `checked`, `hidden`, `accelerator`, `submenu`, and dividers all render.

| Attribute / property   |                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `autohide`             | Hide the bar until it's activated (Alt-toggled, like VS Code's hidden menu bar)          |
| `alt-key` / `altKey`   | `auto` (default: on everywhere except macOS), `on`, or `off`                             |
| `mode`, `config`, `os` | Force a mode, set per-OS modes, or override the detected OS (ignored when `rpc` is set)  |
| `unstyled`             | Drop the default theme                                                                   |
| `extraStyles`          | CSS added to the shadow root                                                             |
| `roleHandlers`         | Webview-side role handlers, checked before the built-in ones                             |
| `resolvedMode`, `open` | Read-only state. The host also reflects `resolved-mode`, `active`, and `open` attributes |

Methods: `openMenu(index?)`, `focusMenuBar()`, and `close()`.

Events (all bubble and are composed): `menuselect` (cancelable; call `preventDefault()` to stop the role from running or the click from being forwarded), `menuopen`, `menuclose`, and `menumodechange`.

### Layout

The bar sits in the page's flow, so a page whose content follows it in normal flow needs nothing. A layout sized to the viewport (`100vh`, `100dvh`, `innerHeight`, or fixed-position panels) doesn't see the bar and would run past the bottom by its height. For those, the element keeps `--electrobun-menu-height` on `<html>` set to the height the bar takes. That's `0px` while it's empty or autohidden, since an activated `autohide` bar overlays the page instead of pushing it down. Use it the way you'd use `env(safe-area-inset-top)`:

```css
#app {
	height: calc(100dvh - var(--electrobun-menu-height, 0px));
}
.fixed-sidebar {
	top: var(--electrobun-menu-height, 0px);
}
```

The overlaid autohide bar has a solid background, `--ebm-overlay-bar-bg` (default `Canvas`).

### Styling

The default theme follows the system light/dark preference. Customize it with CSS custom properties, `::part()`, or both:

```css
electrobun-menu {
	--ebm-bar-bg: #1e1e1e;
	--ebm-menu-radius: 0;
	--ebm-item-highlight-bg: Highlight;
}
electrobun-menu::part(item highlighted) {
	color: HighlightText;
}
```

The parts are `bar`, `bar-item`, `menu`, `item`, `check`, `label`, `mnemonic`, `accelerator`, `submenu-arrow`, and `separator`. Items also get the state parts `highlighted`, `open`, `disabled`, and `checked`. See [`src/menu/styles.ts`](src/menu/styles.ts) for every variable.

## Framework types

`HTMLElementTagNameMap` is augmented automatically. For JSX and templates, import the matching types once:

```ts
import type {} from "electrobun-menu/react"; // <electrobun-menu items={...} onmenuselect={...} />
import type {} from "electrobun-menu/preact";
import type {} from "electrobun-menu/solid"; // on:menuselect={...}
import type {} from "electrobun-menu/svelte"; // onmenuselect={...}
import type {} from "electrobun-menu/vue"; // @menuselect="..." (configure isCustomElement)
```

React 19, Preact, Solid, Svelte 5, and Vue all set `items`, `rpc`, `config`, and `roleHandlers` as properties on custom elements.
