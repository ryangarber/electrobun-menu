describe("mainview main.js", () => {
	it("should exist", async () => {
		await expect(import("./main.ts")).rejects.toThrow(/is not defined/);
	});
});
