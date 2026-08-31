import { useQuery } from "@tanstack/react-query";
import { Button } from "@verilio/ui";

type HealthResponse = {
  status: "ready";
  database: "connected";
};

async function fetchReadiness(): Promise<HealthResponse> {
  const response = await fetch("/health/ready");
  if (!response.ok) throw new Error("API is not ready");
  return response.json() as Promise<HealthResponse>;
}

export function FoundationPage() {
  const readiness = useQuery({
    queryKey: ["health", "ready"],
    queryFn: fetchReadiness,
  });

  return (
    <main className="min-h-screen px-6 py-12 sm:px-10">
      <section className="mx-auto max-w-4xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
        <div className="border-b border-[var(--color-border-default)] px-6 py-5 sm:px-8">
          <p className="text-sm font-semibold tracking-wide text-[var(--color-accent-default)]">
            Verilio
          </p>
        </div>
        <div className="px-6 py-12 sm:px-8 sm:py-16">
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            Freelancer time tracking and invoicing
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Track your work. Bill with confidence.
          </h1>
          <p className="mt-5 max-w-2xl leading-7 text-[var(--color-text-secondary)]">
            The repository foundation is ready for the first product slice: business
            settings.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Button onClick={() => void readiness.refetch()}>Check API readiness</Button>
            <span aria-live="polite" className="text-sm text-[var(--color-text-secondary)]">
              {readiness.isPending && "Checking API…"}
              {readiness.isError && "API is not ready"}
              {readiness.data && "API and PostgreSQL are ready"}
            </span>
          </div>
        </div>
      </section>
    </main>
  );
}

