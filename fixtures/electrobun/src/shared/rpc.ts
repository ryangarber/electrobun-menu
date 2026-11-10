import type { RPCSchema } from "electrobun/main";

export type FixtureRPC = {
	bun: RPCSchema;
	webview: RPCSchema<{
		messages: { menuClicked: { action: string; data?: unknown } };
	}>;
};
