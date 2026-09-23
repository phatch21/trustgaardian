import { describe, expect, it } from "vitest";

describe("agent", () => {
  it("compiles and loads as a module", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
