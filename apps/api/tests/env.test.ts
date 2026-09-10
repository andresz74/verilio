import { describe, expect, it } from "vitest";

import { parseEnvironment } from "../src/env.js";

describe("parseEnvironment", () => {
  it("applies local server defaults", () => {
    const result = parseEnvironment({
      DATABASE_URL: "postgresql://verilio:verilio@localhost:5432/verilio",
    });

    expect(result.API_HOST).toBe("127.0.0.1");
    expect(result.API_PORT).toBe(3_000);
    expect(result.LOCAL_USER_ID).toBe(
      "00000000-0000-4000-8000-000000000001",
    );
  });

  it("accepts a dedicated fixed owner for isolated private/test runtimes", () => {
    const result = parseEnvironment({
      DATABASE_URL: "postgresql://verilio:verilio@localhost:5432/verilio",
      LOCAL_USER_ID: "00000000-0000-4000-8000-000000000099",
    });

    expect(result.LOCAL_USER_ID).toBe(
      "00000000-0000-4000-8000-000000000099",
    );
  });

  it("fails clearly when DATABASE_URL is absent", () => {
    expect(() => parseEnvironment({})).toThrow("Invalid API environment");
  });

  it("reads DATABASE_URL from a secret file", () => {
    const result = parseEnvironment(
      { DATABASE_URL_FILE: "/run/secrets/database_url" },
      () => "postgresql://secret-user:secret-value@postgres:5432/verilio\n",
    );

    expect(result.DATABASE_URL).toBe(
      "postgresql://secret-user:secret-value@postgres:5432/verilio",
    );
  });

  it("gives DATABASE_URL_FILE deterministic precedence over DATABASE_URL", () => {
    const result = parseEnvironment(
      {
        DATABASE_URL: "postgresql://environment:environment@localhost/verilio",
        DATABASE_URL_FILE: "/run/secrets/database_url",
      },
      () => "postgresql://file:file@postgres/verilio",
    );

    expect(result.DATABASE_URL).toBe("postgresql://file:file@postgres/verilio");
  });

  it("does not include database secret contents in validation failures", () => {
    const secret = "not-a-url-with-super-secret-password";

    expect(() =>
      parseEnvironment(
        { DATABASE_URL_FILE: "/run/secrets/database_url" },
        () => secret,
      ),
    ).toThrow("Invalid API environment");

    try {
      parseEnvironment(
        { DATABASE_URL_FILE: "/run/secrets/database_url" },
        () => secret,
      );
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it("fails clearly without exposing file errors", () => {
    expect(() =>
      parseEnvironment(
        { DATABASE_URL_FILE: "/run/secrets/database_url" },
        () => {
          throw new Error("permission denied for /private/secret-value");
        },
      ),
    ).toThrow(
      "Invalid API environment: DATABASE_URL_FILE could not be read or was empty.",
    );
  });
});
