import type { HTMLAttributes } from "svelte/elements";
import type { ElectrobunMenuElement } from "../menu/element.ts";
import type { ElectrobunMenuEventProps, ElectrobunMenuProps } from "./props.ts";

export type {
	ElectrobunMenuEventProps,
	ElectrobunMenuEvents,
	ElectrobunMenuProps,
} from "./props.ts";

/** Svelte 5 sets props that exist on the element as properties. */
export type ElectrobunMenuSvelteProps = Omit<
	HTMLAttributes<ElectrobunMenuElement>,
	keyof ElectrobunMenuProps
> &
	ElectrobunMenuProps &
	ElectrobunMenuEventProps;

declare module "svelte/elements" {
	interface SvelteHTMLElements {
		"electrobun-menu": ElectrobunMenuSvelteProps;
	}
}
