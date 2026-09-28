import { expect, test } from "@playwright/test";
import type { RecentTimeEntriesResponse, TimeEntryResponse, TimerStateResponse } from "@verilio/contracts";

test("tracks authoritative timer and manual time through the M4 exit gate", async ({ page, request }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });

  const current = await request.get("/api/v1/timer/current");
  if ((await current.json() as { timer: unknown }).timer) await request.post("/api/v1/timer/stop");

  const suffix = Date.now().toString().slice(-8);
  const clientName = `M4 Timer Client ${suffix}`;
  const projectName = `M4 Timer Project ${suffix}`;
  const taskName = `M4 Timer Task ${suffix}`;
  const timerDescription = `Authoritative timer ${suffix}`;

  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).click();
  let dialog = page.getByRole("dialog", { name: "Create client" });
  await dialog.getByLabel(/Client name/).fill(clientName);
  await dialog.getByLabel(/Currency/).fill("USD");
  await dialog.getByLabel(/Use business default/).check();
  await dialog.getByRole("button", { name: "Create client" }).click();

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  dialog = page.getByRole("dialog", { name: "Create project" });
  await dialog.getByRole("combobox", { name: /^Client/ }).selectOption({ label: `${clientName} — USD` });
  await dialog.getByLabel(/Project name/).fill(projectName);
  await dialog.getByLabel("Override hourly rate").check();
  await dialog.getByLabel(/Hourly rate override/).fill("135");
  await dialog.getByRole("button", { name: "Create project" }).click();
  const projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await projectRow.getByRole("link", { name: new RegExp(projectName) }).click();
  await page.getByRole("button", { name: "Add task" }).click();
  dialog = page.getByRole("dialog", { name: "Create task" });
  await dialog.getByLabel(/Task name/).fill(taskName);
  await dialog.getByRole("button", { name: "Create task" }).click();

  await page.goto("/timer");
  const composer = page.getByRole("region", { name: "What are you working on?" });
  await expect(composer.getByRole("textbox", { name: "Activity", exact: true })).toHaveAttribute("placeholder", "What are you working on?");
  await composer.getByRole("textbox", { name: "Activity", exact: true }).fill(timerDescription);
  await expect(page.getByRole("heading", { name: "Recent activities", exact: true })).toBeVisible();
  await composer.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await composer.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await composer.getByRole("combobox", { name: "Task (optional)" }).selectOption({ label: taskName });
  await composer.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("region", { name: "Running timer" })).toContainText(timerDescription);

  await page.getByRole("link", { name: "Clients" }).click();
  await expect(page).toHaveURL(/\/clients$/);
  await expect(page.getByRole("navigation").getByRole("link", { name: timerDescription })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("navigation").getByRole("link", { name: timerDescription })).toBeVisible();
  await page.getByRole("link", { name: timerDescription }).click();
  const runningRegion = page.getByRole("region", { name: "Running timer" });
  await expect(runningRegion).toContainText(timerDescription);
  await runningRegion.getByRole("button", { name: "Stop" }).click();
  const timerEntry = page.locator("article").filter({ hasText: timerDescription });
  await expect(timerEntry).toContainText("135.00/hr");
  const recentBeforeContinue = await (await request.get("/api/v1/time-entries/recent")).json() as RecentTimeEntriesResponse;
  const source = recentBeforeContinue.entries.find((entry) => entry.description === timerDescription)!;
  expect(source).toBeDefined();

  await page.goto("/projects");
  await projectRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit project" });
  await dialog.getByLabel(/Hourly rate override/).fill("200");
  await dialog.getByRole("button", { name: "Save project" }).click();
  await page.goto("/timer");
  await expect(page.locator("article").filter({ hasText: timerDescription })).toContainText("135.00/hr");

  // One keyboard action reuses work context, not the old rate or entry identity.
  const continueButton = timerEntry.getByRole("button", { name: "Continue activity" });
  await continueButton.focus();
  await continueButton.press("Enter");
  await expect(runningRegion).toContainText(timerDescription);
  const continued = await (await request.get("/api/v1/timer/current")).json() as TimerStateResponse;
  expect(continued.timer).toMatchObject({ description: source.description, clientId: source.clientId, projectId: source.projectId, taskId: source.taskId, billable: source.billable, hourlyRate: null, currency: null, invoice: null, hasInvoiceHistory: false });
  expect(continued.timer?.id).not.toBe(source.id);
  expect(continued.timer?.startAt).not.toBe(source.startAt);
  await page.reload();
  await expect(runningRegion).toContainText(timerDescription);
  await runningRegion.getByRole("button", { name: "Stop" }).click();
  await expect(timerEntry).toHaveCount(1);
  await expect(timerEntry).toContainText("2 sessions");
  const expand = timerEntry.getByRole("button", { name: `Show sessions for ${timerDescription}` });
  await expand.focus();
  await expand.press("Enter");
  await expect(timerEntry.getByRole("button", { name: `Hide sessions for ${timerDescription}` })).toHaveAttribute("aria-expanded", "true");
  await expect(timerEntry.getByRole("listitem")).toHaveCount(2);
  await expect(timerEntry.getByText("Billable · 135.00/hr")).toBeVisible();
  await expect(timerEntry.getByText("Billable · 200.00/hr")).toBeVisible();
  const newEntry = await (await request.get(`/api/v1/time-entries/${continued.timer!.id}`)).json() as TimeEntryResponse;
  expect(newEntry.entry.hourlyRate).toBe("200.0000");
  const unchangedSource = await (await request.get(`/api/v1/time-entries/${source.id}`)).json() as TimeEntryResponse;
  expect(unchangedSource.entry).toEqual(source);

  // Group Continue stays reachable on narrow screens and excludes the live session.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(timerEntry.getByRole("button", { name: "Continue activity" })).toBeVisible();
  await expect(page.getByRole("button", { name: `Hide sessions for ${timerDescription}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await timerEntry.getByRole("button", { name: "Continue activity" }).click();
  await expect(runningRegion).toContainText(timerDescription);
  await expect(timerEntry).toContainText("2 sessions");
  await runningRegion.getByRole("button", { name: "Stop" }).click();
  await expect(timerEntry).toContainText("3 sessions");
  await page.setViewportSize({ width: 1280, height: 720 });

  await page.getByRole("button", { name: /Add time/ }).click();
  dialog = page.getByRole("dialog", { name: "Add time manually" });
  await dialog.getByRole("textbox", { name: "Start", exact: true }).fill("23:30");
  await dialog.getByRole("textbox", { name: "End", exact: true }).fill("01:00");
  await dialog.getByText("End is on the next calendar day").click();
  await dialog.getByRole("textbox", { name: "Description" }).fill(`Cross midnight ${suffix}`);
  await dialog.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await dialog.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await dialog.getByRole("button", { name: "Add time" }).click();
  const rangeEntry = page.locator("article").filter({ hasText: `Cross midnight ${suffix}` });
  await expect(rangeEntry).toContainText("1h 30m");

  await page.getByRole("button", { name: /Add time/ }).click();
  dialog = page.getByRole("dialog", { name: "Add time manually" });
  await dialog.getByRole("radio", { name: "Duration" }).check();
  await dialog.getByPlaceholder("1:30 or 90m").fill("2h 15m");
  await dialog.getByRole("textbox", { name: "Description" }).fill(`Duration entry ${suffix}`);
  await dialog.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await dialog.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await dialog.getByRole("button", { name: "Add time" }).click();
  const durationEntry = page.locator("article").filter({ hasText: `Duration entry ${suffix}` });
  await expect(durationEntry).toContainText("2h 15m");

  await durationEntry.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit time entry" });
  await dialog.getByRole("textbox", { name: "Description" }).fill(`Duration edited ${suffix}`);
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(page.locator("article").filter({ hasText: `Duration edited ${suffix}` })).toBeVisible();

  await rangeEntry.getByRole("button", { name: "Delete" }).click();
  dialog = page.getByRole("dialog", { name: "Delete time entry?" });
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(rangeEntry).not.toBeVisible();
  expect(consoleProblems).toEqual([]);
});
