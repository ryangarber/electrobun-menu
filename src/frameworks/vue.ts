import type { HTMLAttributes } from "vue";
import type { ElectrobunMenuElement } from "../menu/element.ts";
import type { ElectrobunMenuEvents, ElectrobunMenuProps } from "./props.ts";

export type { ElectrobunMenuEvents, ElectrobunMenuProps } from "./props.ts";

type VueEventProps = {
	[K in keyof ElectrobunMenuEvents as `on${Capitalize<K>}`]?: (
		event: ElectrobunMenuEvents[K],
	) => void;
};

/**
 * Vue sets props that exist on the element as properties. Register the tag
 * with `compilerOptions.isCustomElement` and listen with `@menuselect`.
 */
export type ElectrobunMenuVueProps = Omit<
	HTMLAttributes,
	keyof ElectrobunMenuProps
> &
	ElectrobunMenuProps &
	VueEventProps;

declare module "vue" {
	interface GlobalComponents {
		"electrobun-menu": new () => ElectrobunMenuElement & {
			$props: ElectrobunMenuVueProps;
		};
	}
}
