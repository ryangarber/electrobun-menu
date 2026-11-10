import { Electroview } from "electrobun/view";
import "../../../../src/menu.ts";
import type { FixtureRPC } from "../shared/rpc.ts";

// biome-ignore lint/style/noNonNullAssertion: fixture
const app = document.getElementById("app")!;
// biome-ignore lint/style/noNonNullAssertion: fixture
const menu = document.querySelector("electrobun-menu")!;

const log: string[] = [];

app.innerHTML = `
	<main>
		<h1>electrobun-menu</h1>
		<p>Resolved menu mode: <code id="mode"></code></p>
		<textarea placeholder="Type here, then try Edit → Copy or Ctrl+N"></textarea>
		<h2>Clicks</h2>
		<ul id="log"></ul>
	</main>
`;

function render() {
	// biome-ignore lint/style/noNonNullAssertion: fixture
	document.getElementById("mode")!.textContent = menu.resolvedMode;
	// biome-ignore lint/style/noNonNullAssertion: fixture
	document.getElementById("log")!.innerHTML = log
		.map((entry) => `<li>${entry}</li>`)
		.join("");
}

const rpc = Electroview.defineRPC<FixtureRPC>({
	handlers: {
		messages: {
			menuClicked: ({ action, data }) => {
				log.unshift(`${action}${data ? ` ${JSON.stringify(data)}` : ""}`);
				render();
			},
		},
	},
});
new Electroview({ rpc });

menu.rpc = rpc;
menu.addEventListener("menumodechange", render);
render();
