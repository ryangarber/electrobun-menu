/** Always applied: visibility rules the element relies on. */
export const baseStyles: string = `
:host {
	display: block;
}
:host([empty]),
:host([autohide]:not([active])) {
	display: none !important;
}
[part~="menu"] {
	position: fixed;
	inset: auto;
	margin: 0;
	box-sizing: border-box;
	max-height: 100vh;
	overflow: auto;
	z-index: 2147483647;
}
[part~="menu"]:popover-open {
	inset: auto;
}
[part~="mnemonic"] {
	text-decoration: none;
}
:host([show-mnemonics]) [part~="mnemonic"] {
	text-decoration: underline;
}
`;

/** The default theme. Omitted when the element has the `unstyled` attribute. */
export const defaultStyles: string = `
:host {
	--ebm-font: 13px system-ui, -apple-system, "Segoe UI", Ubuntu, sans-serif;
	--ebm-bar-height: 28px;
	--ebm-bar-padding: 0 4px;
	--ebm-bar-bg: transparent;
	--ebm-bar-fg: inherit;
	--ebm-bar-border: 1px solid rgb(0 0 0 / 0.08);
	--ebm-bar-item-padding: 0 8px;
	--ebm-bar-item-radius: 4px;
	--ebm-hover-bg: rgb(0 0 0 / 0.07);
	--ebm-active-bg: rgb(0 0 0 / 0.12);
	--ebm-menu-bg: #fff;
	--ebm-menu-fg: #1f1f1f;
	--ebm-menu-border: 1px solid rgb(0 0 0 / 0.12);
	--ebm-menu-radius: 6px;
	--ebm-menu-padding: 4px;
	--ebm-menu-shadow: 0 6px 20px rgb(0 0 0 / 0.14);
	--ebm-menu-min-width: 200px;
	--ebm-item-height: 26px;
	--ebm-item-padding: 0 10px 0 4px;
	--ebm-item-radius: 4px;
	--ebm-item-highlight-bg: rgb(0 0 0 / 0.07);
	--ebm-item-highlight-fg: inherit;
	--ebm-muted-fg: rgb(0 0 0 / 0.5);
	--ebm-disabled-fg: rgb(0 0 0 / 0.35);
	--ebm-separator: rgb(0 0 0 / 0.1);

	font: var(--ebm-font);
	color: var(--ebm-bar-fg);
	user-select: none;
	-webkit-user-select: none;
	cursor: default;
}
@media (prefers-color-scheme: dark) {
	:host {
		--ebm-bar-border: 1px solid rgb(255 255 255 / 0.08);
		--ebm-hover-bg: rgb(255 255 255 / 0.08);
		--ebm-active-bg: rgb(255 255 255 / 0.14);
		--ebm-menu-bg: #2b2b2b;
		--ebm-menu-fg: #e8e8e8;
		--ebm-menu-border: 1px solid rgb(255 255 255 / 0.1);
		--ebm-menu-shadow: 0 6px 20px rgb(0 0 0 / 0.45);
		--ebm-item-highlight-bg: rgb(255 255 255 / 0.1);
		--ebm-muted-fg: rgb(255 255 255 / 0.5);
		--ebm-disabled-fg: rgb(255 255 255 / 0.35);
		--ebm-separator: rgb(255 255 255 / 0.1);
	}
}
[part~="bar"] {
	display: flex;
	align-items: center;
	gap: 1px;
	height: var(--ebm-bar-height);
	padding: var(--ebm-bar-padding);
	background: var(--ebm-bar-bg);
	border-bottom: var(--ebm-bar-border);
	box-sizing: border-box;
}
[part~="bar-item"] {
	display: flex;
	align-items: center;
	height: calc(100% - 6px);
	padding: var(--ebm-bar-item-padding);
	border-radius: var(--ebm-bar-item-radius);
	white-space: nowrap;
}
[part~="bar-item"][part~="highlighted"] {
	background: var(--ebm-hover-bg);
}
[part~="bar-item"][part~="open"] {
	background: var(--ebm-active-bg);
}
[part~="menu"] {
	min-width: var(--ebm-menu-min-width);
	padding: var(--ebm-menu-padding);
	background: var(--ebm-menu-bg);
	color: var(--ebm-menu-fg);
	border: var(--ebm-menu-border);
	border-radius: var(--ebm-menu-radius);
	box-shadow: var(--ebm-menu-shadow);
	font: var(--ebm-font);
}
[part~="item"] {
	display: grid;
	grid-template-columns: 20px 1fr auto 16px;
	align-items: center;
	height: var(--ebm-item-height);
	padding: var(--ebm-item-padding);
	border-radius: var(--ebm-item-radius);
	white-space: nowrap;
}
[part~="item"][part~="highlighted"] {
	background: var(--ebm-item-highlight-bg);
	color: var(--ebm-item-highlight-fg);
}
[part~="item"][part~="disabled"],
[part~="bar-item"][part~="disabled"] {
	color: var(--ebm-disabled-fg);
}
[part~="check"] {
	text-align: center;
}
[part~="accelerator"] {
	padding-left: 24px;
	color: var(--ebm-muted-fg);
	font-variant-numeric: tabular-nums;
}
[part~="item"][part~="disabled"] [part~="accelerator"] {
	color: inherit;
}
[part~="submenu-arrow"] {
	text-align: right;
	color: var(--ebm-muted-fg);
}
[part~="separator"] {
	height: 1px;
	margin: 4px 6px;
	background: var(--ebm-separator);
}
`;
