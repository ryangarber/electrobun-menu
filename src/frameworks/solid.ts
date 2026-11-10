import type { JSX } from "solid-js";
import type { ElectrobunMenuElement } from "../menu/element.ts";
import type { ElectrobunMenuEvents, ElectrobunMenuProps } from "./props.ts";

export type { ElectrobunMenuEvents, ElectrobunMenuProps } from "./props.ts";

/** Solid assigns props on custom elements as properties; use `on:menuselect` for events. */
export type ElectrobunMenuSolidProps = Omit<
	JSX.HTMLAttributes<ElectrobunMenuElement>,
	keyof ElectrobunMenuProps
> &
	ElectrobunMenuProps;

declare module "solid-js" {
	namespace JSX {
		interface IntrinsicElements {
			"electrobun-menu": ElectrobunMenuSolidProps;
		}
		interface CustomEvents extends ElectrobunMenuEvents {}
	}
}
