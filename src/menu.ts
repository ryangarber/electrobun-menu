import { ElectrobunMenuElement } from "./menu/element.ts";

export * from "./menu/element.ts";
export { baseStyles, defaultStyles } from "./menu/styles.ts";
export type { Accelerator } from "./shared/accelerator.ts";
export {
	formatAccelerator,
	matchesAccelerator,
	parseAccelerator,
} from "./shared/accelerator.ts";
export { menuConfigWithDefaults, resolveMenuMode } from "./shared/mode.ts";
export type {
	ApplicationMenuItemConfig,
	MenuConfig,
	MenuItemPlacement,
	MenuMode,
	MenuRole,
	MenuRPC,
	NormalMenuItemConfig,
	SerializedMenuItem,
	SupportedOS,
} from "./shared/types.ts";

declare global {
	interface HTMLElementTagNameMap {
		"electrobun-menu": ElectrobunMenuElement;
	}
}

if (
	typeof customElements !== "undefined" &&
	!customElements.get(ElectrobunMenuElement.tagName)
) {
	customElements.define(ElectrobunMenuElement.tagName, ElectrobunMenuElement);
}
