import { execFileSync } from "node:child_process";

export const E2E_OWNER_ID = "00000000-0000-4000-8000-000000000090";

export function resetE2eOwner(seedSettings: boolean): void {
  execFileSync(
    "pnpm",
    ["--filter", "@verilio/api", "exec", "tsx", "tests/support/cleanup-e2e-owner.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL:
          process.env.DATABASE_URL ??
          "postgresql://verilio:verilio@127.0.0.1:5432/verilio",
        LOCAL_USER_ID: E2E_OWNER_ID,
        E2E_SEED_SETTINGS: seedSettings ? "true" : "false",
      },
      stdio: "inherit",
    },
  );
}
