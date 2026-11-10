import type { HTMLAttributes } from "preact";
import type { ElectrobunMenuElement } from "../menu/element.ts";
import type { ElectrobunMenuEventProps, ElectrobunMenuProps } from "./props.ts";

export type {
	ElectrobunMenuEventProps,
	ElectrobunMenuEvents,
	ElectrobunMenuProps,
} from "./props.ts";

export type ElectrobunMenuPreactProps = Omit<
	HTMLAttributes<ElectrobunMenuElement>,
	keyof ElectrobunMenuProps
> &
	ElectrobunMenuProps &
	ElectrobunMenuEventProps;

declare module "preact" {
	namespace JSX {
		interface IntrinsicElements {
			"electrobun-menu": ElectrobunMenuPreactProps;
		}
	}
}
