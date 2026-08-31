import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/env.js";

describe("parseEnvironment", () => {
  it("applies local server defaults", () => {
    const result = parseEnvironment({
      DATABASE_URL: "postgresql://verilio:verilio@localhost:5432/verilio",
    });

    expect(result.API_HOST).toBe("127.0.0.1");
    expect(result.API_PORT).toBe(3_000);
  });

  it("fails clearly when DATABASE_URL is absent", () => {
    expect(() => parseEnvironment({})).toThrow("Invalid API environment");
  });
});

