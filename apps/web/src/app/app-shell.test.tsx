import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AppNavigation } from "./app-shell.js";

describe("AppNavigation", () => {
  it("renders only the documented primary destinations and exposes the active section", () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <AppNavigation />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Timer",
      "Timesheet",
      "Reports",
      "Clients",
      "Projects",
      "Invoices",
      "Settings",
    ]);
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("supports keyboard navigation", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/timer"]}>
        <AppNavigation />
      </MemoryRouter>,
    );

    await user.tab();
    expect(screen.getByRole("link", { name: "Timer" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("link", { name: "Timesheet" })).toHaveFocus();
  });
});
