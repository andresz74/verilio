import { expect, test } from "@playwright/test";

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
  await composer.getByRole("textbox", { name: "Description" }).fill(timerDescription);
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
  await expect(timerEntry).toContainText("135.0000/hr");

  await page.goto("/projects");
  await projectRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit project" });
  await dialog.getByLabel(/Hourly rate override/).fill("200");
  await dialog.getByRole("button", { name: "Save project" }).click();
  await page.goto("/timer");
  await expect(page.locator("article").filter({ hasText: timerDescription })).toContainText("135.0000/hr");

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
