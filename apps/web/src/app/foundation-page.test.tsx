import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FoundationPage } from "./foundation-page.js";

describe("FoundationPage", () => {
  it("reports API and database readiness", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <FoundationPage />
      </QueryClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Track your work. Bill with confidence." }),
    ).toBeInTheDocument();
    expect(await screen.findByText("API and PostgreSQL are ready")).toBeInTheDocument();
  });
});
