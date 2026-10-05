/* global process */
import { execFileSync, spawnSync } from "node:child_process";
import { URL, fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { E2E_OWNER_ID } from "../../../tests/e2e/global-cleanup.js";
import globalSetup from "../../../tests/e2e/global-setup.js";
import globalTeardown from "../../../tests/e2e/global-teardown.js";

vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal()),
  execFileSync: vi.fn(),
}));

const apiDirectory = fileURLToPath(new URL("../", import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("E2E owner cleanup source-mode subprocess", () => {
  it.each([
    undefined,
    "",
    "--trace-warnings --max-old-space-size=512",
    "--trace-warnings --conditions=development",
    "--conditions development --trace-warnings",
  ])("preserves caller options %j for setup and teardown", (nodeOptions) => {
    vi.stubEnv("NODE_OPTIONS", nodeOptions);
    vi.stubEnv("DATABASE_URL", "postgresql://fixture/cleanup");
    vi.stubEnv("LOCAL_USER_ID", "caller-owner");
    vi.stubEnv("E2E_SEED_SETTINGS", "caller-seed");

    for (const [reset, seed] of [
      [globalSetup, "true"],
      [globalTeardown, "false"],
    ]) {
      reset();
      const [command, args, options] = vi.mocked(execFileSync).mock.lastCall;
      expect(command).toBe("pnpm");
      expect(args).toEqual([
        "--filter", "@verilio/api", "exec", "tsx", "tests/support/cleanup-e2e-owner.ts",
      ]);
      const env = options?.env;
      expect(env).toMatchObject({
        DATABASE_URL: "postgresql://fixture/cleanup",
        LOCAL_USER_ID: E2E_OWNER_ID,
        E2E_SEED_SETTINGS: seed,
      });
      if (nodeOptions) expect(env?.NODE_OPTIONS).toContain(nodeOptions);
      const conditions = env?.NODE_OPTIONS?.match(/--conditions(?:=|\s+)development/g);
      expect(conditions).toHaveLength(1);

      // Ask Node to resolve the package using the exact subprocess environment.
      // This reads package exports, without importing a direct source path or a DB.
      const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
        console.log(import.meta.resolve("@verilio/db"));
        console.log(process.env.NODE_OPTIONS);
      `], { cwd: apiDirectory, env, encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      const [resolved, receivedOptions] = result.stdout.trim().split("\n");
      expect(resolved).toMatch(/\/packages\/db\/src\/index\.ts$/);
      expect(receivedOptions).toBe(env?.NODE_OPTIONS);
    }
    expect(process.env.NODE_OPTIONS).toBe(nodeOptions);
  });

  it("retains the default database URL when none is supplied", () => {
    vi.stubEnv("DATABASE_URL", undefined);
    globalSetup();
    expect(vi.mocked(execFileSync).mock.lastCall?.[2]?.env?.DATABASE_URL).toBe(
      "postgresql://verilio:verilio@127.0.0.1:5432/verilio",
    );
  });
});
