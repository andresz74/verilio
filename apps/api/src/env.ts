import { z } from "zod";

const EnvironmentSchema = z.object({
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
  DATABASE_URL: z.url().refine((url) => url.startsWith("postgresql://"), {
    message: "DATABASE_URL must use postgresql://",
  }),
  LOCAL_USER_ID: z
    .uuid()
    .default("00000000-0000-4000-8000-000000000001"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type Environment = z.infer<typeof EnvironmentSchema>;

export function parseEnvironment(source: NodeJS.ProcessEnv): Environment {
  const result = EnvironmentSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API environment: ${details}`);
  }

  return result.data;
}
