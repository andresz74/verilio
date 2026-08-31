import { PageHeader } from "./app-shell.js";

export function PlaceholderPage({ description, title }: { description: string; title: string }) {
  return (
    <main>
      <PageHeader title={title} description={description} />
      <div className="px-5 py-8 sm:px-8 lg:px-10">
        <section className="max-w-3xl rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-6 py-10">
          <p className="m-0 text-sm font-medium text-[var(--color-text-secondary)]">
            This workspace is ready for its documented feature milestone.
          </p>
        </section>
      </div>
    </main>
  );
}

