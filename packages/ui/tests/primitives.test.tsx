import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  Button,
  Checkbox,
  DateRangePicker,
  Dialog,
  DialogClose,
  Field,
  StatusBadge,
  Switch,
  TextInput,
} from "../src/index.js";

describe("form primitives", () => {
  it("associates a visible field label and exposes validation state", () => {
    render(
      <Field htmlFor="business-name" label="Business name" error="Business name is required" required>
        <TextInput
          id="business-name"
          aria-describedby="business-name-error"
          aria-invalid="true"
        />
      </Field>,
    );

    expect(screen.getByLabelText(/Business name/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Business name is required");
  });

  it("provides keyboard-operable checkbox and switch controls", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Checkbox aria-label="Include archived" />
        <Switch aria-label="Billable" />
      </>,
    );

    await user.click(screen.getByRole("checkbox", { name: "Include archived" }));
    await user.click(screen.getByRole("switch", { name: "Billable" }));

    expect(screen.getByRole("checkbox", { name: "Include archived" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "Billable" })).toBeChecked();
  });

  it("renders explicit status text", () => {
    render(<StatusBadge tone="success">Paid</StatusBadge>);
    expect(screen.getByText("Paid")).toBeVisible();
  });

  it("labels the reusable date-range controls and supports keyboard changes", async () => {
    const user = userEvent.setup();

    function RangeHarness() {
      const [preset, setPreset] = useState("this-week");
      const [range, setRange] = useState({ from: "2026-08-31", to: "2026-09-06" });
      return (
        <DateRangePicker
          preset={preset}
          presets={[
            { value: "this-week", label: "This week" },
            { value: "custom", label: "Custom range" },
          ]}
          from={range.from}
          to={range.to}
          onPresetChange={setPreset}
          onChange={setRange}
        />
      );
    }

    render(<RangeHarness />);
    expect(screen.getByLabelText("From")).toHaveValue("2026-08-31");
    await user.selectOptions(screen.getByLabelText("Period"), "custom");
    expect(screen.getByLabelText("Period")).toHaveValue("custom");
    await user.tab();
    expect(screen.getByLabelText("From")).toHaveFocus();
  });
});

describe("Dialog", () => {
  it("moves focus inside and restores it to the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Dialog
        title="Archive project"
        description="Historical time will remain available."
        trigger={<Button>Open dialog</Button>}
        footer={
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
        }
      >
        <p>Dialog content</p>
      </Dialog>,
    );

    const trigger = screen.getByRole("button", { name: "Open dialog" });
    await user.click(trigger);

    expect(screen.getByRole("dialog", { name: "Archive project" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });

  it("restores focus when a controlled dialog is conditionally unmounted", async () => {
    const user = userEvent.setup();

    function ControlledDialogHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Button onClick={() => setOpen(true)}>Edit project</Button>
          {open ? (
            <Dialog open title="Edit project" onOpenChange={setOpen}>
              <TextInput aria-label="Project name" autoFocus />
            </Dialog>
          ) : null}
        </>
      );
    }

    render(<ControlledDialogHarness />);
    const trigger = screen.getByRole("button", { name: "Edit project" });
    await user.click(trigger);
    expect(screen.getByRole("textbox", { name: "Project name" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
  });
});
