import type { DetailedHTMLProps, HTMLAttributes } from "react";
import type { ElectrobunMenuElement } from "../menu/element.ts";
import type { ElectrobunMenuEventProps, ElectrobunMenuProps } from "./props.ts";

export type {
	ElectrobunMenuEventProps,
	ElectrobunMenuEvents,
	ElectrobunMenuProps,
} from "./props.ts";

/** React 19 sets known properties (like `items` and `rpc`) on custom elements directly. */
export type ElectrobunMenuReactProps = Omit<
	DetailedHTMLProps<
		HTMLAttributes<ElectrobunMenuElement>,
		ElectrobunMenuElement
	>,
	keyof ElectrobunMenuProps
> &
	ElectrobunMenuProps &
	ElectrobunMenuEventProps;

declare module "react" {
	namespace JSX {
		interface IntrinsicElements {
			"electrobun-menu": ElectrobunMenuReactProps;
		}
	}
}
