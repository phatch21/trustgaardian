import { describe, expect, it } from "vitest";

describe("tokens", () => {
  it("compiles and loads as a module", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
