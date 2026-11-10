import type Electrobun from "electrobun/main";
import type {
	BrowserView,
	BrowserWindow,
	ApplicationMenuItemConfig as NativeItem,
	RPCSchema,
} from "electrobun/main";
import type { Electroview } from "electrobun/view";
import type {} from "./frameworks/preact.ts";
import type {} from "./frameworks/react.ts";
import type {} from "./frameworks/solid.ts";
import type {} from "./frameworks/svelte.ts";
import type {} from "./frameworks/vue.ts";
import type { ElectrobunMenuElement } from "./menu/element.ts";
import type { ApplicationMenuItemConfig, MenuRPC } from "./shared/types.ts";
import type { ElectrobunLike, MenuAttachTarget } from "./types.ts";

describe("types", () => {
	it("mirrors Electrobun's ApplicationMenuItemConfig", () => {
		expectTypeOf<ApplicationMenuItemConfig>().toExtend<NativeItem>();
		expectTypeOf<NativeItem>().toExtend<ApplicationMenuItemConfig>();
	});

	it("accepts Electrobun's main-process API and RPC instances", () => {
		expectTypeOf<typeof Electrobun>().toExtend<ElectrobunLike>();
		expectTypeOf<BrowserView>().toExtend<MenuAttachTarget>();
		expectTypeOf<BrowserWindow>().toExtend<MenuAttachTarget>();

		type Schema = {
			bun: RPCSchema<{
				requests: { ping: { params: undefined; response: string } };
			}>;
			webview: RPCSchema<{ messages: { pong: string } }>;
		};
		expectTypeOf<
			ReturnType<typeof BrowserView.defineRPC<Schema>>
		>().toExtend<MenuRPC>();
		expectTypeOf<
			ReturnType<typeof Electroview.defineRPC<Schema>>
		>().toExtend<MenuRPC>();
	});

	it("registers the element with the DOM and every renderer", () => {
		expectTypeOf<
			HTMLElementTagNameMap["electrobun-menu"]
		>().toEqualTypeOf<ElectrobunMenuElement>();

		type ReactProps = import("react").JSX.IntrinsicElements["electrobun-menu"];
		expectTypeOf<ReactProps>().toHaveProperty("items");
		expectTypeOf<ReactProps>().toHaveProperty("onmenuselect");

		type PreactProps =
			import("preact").JSX.IntrinsicElements["electrobun-menu"];
		expectTypeOf<PreactProps>().toHaveProperty("rpc");

		type SolidProps =
			import("solid-js").JSX.IntrinsicElements["electrobun-menu"];
		expectTypeOf<SolidProps>().toHaveProperty("on:menuselect");

		type SvelteProps =
			import("svelte/elements").SvelteHTMLElements["electrobun-menu"];
		expectTypeOf<SvelteProps>().toHaveProperty("onmenuselect");

		type VueComponent = import("vue").GlobalComponents["electrobun-menu"];
		expectTypeOf<InstanceType<VueComponent>["$props"]>().toHaveProperty(
			"onMenuselect",
		);
	});
});
