describe("core entry", () => {
	it("should exist", async () => {
		await expect(import("./index.ts")).resolves.toBeDefined();
	});
});
