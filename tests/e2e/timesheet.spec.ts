import { expect, test, type APIResponse } from "@playwright/test";

test("reviews and corrects historical time through the M5 exit gate", async ({ page, request }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });

  const suffix = Date.now().toString().slice(-8);
  const clientName = `M5 Client ${suffix}`;
  const projectName = `M5 Project ${suffix}`;
  const taskName = `M5 Task ${suffix}`;
  const year = 2035;
  const monthName = "May";
  const firstDate = "2035-05-10";
  const secondDate = "2035-05-11";

  const clientResponse = await request.post("/api/v1/clients", {
    data: {
      name: clientName,
      email: "",
      ccRecipients: [],
      address: "",
      note: "",
      currency: "USD",
      rateMode: "inherit",
      defaultHourlyRate: null,
    },
  });
  await expectOk(clientResponse);
  const clientId = (await clientResponse.json() as { client: { id: string } }).client.id;

  const projectResponse = await request.post("/api/v1/projects", {
    data: {
      clientId,
      name: projectName,
      color: "",
      rateMode: "inherit",
      defaultHourlyRate: null,
      billableByDefault: true,
      note: "",
    },
  });
  await expectOk(projectResponse);
  const projectId = (await projectResponse.json() as { project: { id: string } }).project.id;

  const taskResponse = await request.post(`/api/v1/projects/${projectId}/tasks`, {
    data: { name: taskName },
  });
  await expectOk(taskResponse);
  const taskId = (await taskResponse.json() as { task: { id: string } }).task.id;

  const originalDescription = `Original duration ${suffix}`;
  const rangeDescription = `Historical range ${suffix}`;
  await expectOk(await request.post("/api/v1/time-entries", {
    data: {
      mode: "duration",
      workDate: firstDate,
      durationSeconds: 3_600,
      clientId,
      projectId,
      taskId,
      description: originalDescription,
      billable: true,
    },
  }));
  await expectOk(await request.post("/api/v1/time-entries", {
    data: {
      mode: "range",
      workDate: secondDate,
      startTime: "09:00",
      endTime: "10:30",
      endsNextDay: false,
      clientId,
      projectId,
      taskId,
      description: rangeDescription,
      billable: false,
    },
  }));

  await page.goto(`/timesheet?from=${firstDate}&to=${secondDate}`);
  const firstGroup = page.getByRole("region", { name: new RegExp(`${monthName} 10, ${year}`) });
  const secondGroup = page.getByRole("region", { name: new RegExp(`${monthName} 11, ${year}`) });
  await expect(firstGroup).toContainText("1h");
  await expect(secondGroup).toContainText("1h 30m");
  await expect(firstGroup.locator("article").filter({ hasText: originalDescription })).toContainText("Duration only");

  await page.getByLabel("From").fill(secondDate);
  await expect(page).toHaveURL(new RegExp(`from=${secondDate}.*to=${secondDate}`));
  await expect(firstGroup).not.toBeVisible();
  await expect(secondGroup).toBeVisible();
  await page.getByLabel("From").fill(firstDate);

  const addedDescription = `Missing time ${suffix}`;
  await page.getByRole("button", { name: "Add time" }).click();
  let dialog = page.getByRole("dialog", { name: "Add time manually" });
  await dialog.getByRole("radio", { name: "Duration" }).check();
  await dialog.getByLabel(/Work date/).fill(firstDate);
  await dialog.getByPlaceholder("1:30 or 90m").fill("30m");
  await dialog.getByRole("textbox", { name: "Description" }).fill(addedDescription);
  await dialog.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await dialog.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await dialog.getByRole("combobox", { name: "Task (optional)" }).selectOption({ label: taskName });
  await dialog.getByRole("button", { name: "Add time" }).click();
  await expect(firstGroup).toContainText("1h 30m");

  const originalRow = page.locator("article").filter({ hasText: originalDescription });
  await originalRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit time entry" });
  await dialog.getByLabel(/Work date/).fill(secondDate);
  await dialog.getByPlaceholder("1:30 or 90m").fill("2:00");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(secondGroup).toContainText("3h 30m");
  await expect(firstGroup).toContainText("30m");

  const addedRow = page.locator("article").filter({ hasText: addedDescription });
  await addedRow.getByRole("button", { name: "Delete" }).click();
  dialog = page.getByRole("dialog", { name: "Delete time entry?" });
  await expect(dialog).toContainText(addedDescription);
  await dialog.getByRole("button", { name: "Delete permanently" }).click();
  await expect(firstGroup).not.toBeVisible();
  await expect(secondGroup).toContainText("3h 30m");

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`from=${firstDate}.*to=${secondDate}`));
  await expect(secondGroup).toContainText("3h 30m");
  expect(consoleProblems).toEqual([]);
});

async function expectOk(response: APIResponse): Promise<void> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBe(true);
}
