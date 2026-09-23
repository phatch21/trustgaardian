import { describe, expect, it } from "vitest";

describe("catalog", () => {
  it("compiles and loads as a module", async () => {
    const mod = await import("./index.js");
    expect(mod).toBeDefined();
  });
});
