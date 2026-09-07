import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

test("reports historical rates and currencies through the M6 exit gate", async ({ page, request }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });

  const suffix = Date.now().toString().slice(-8);
  const firstDate = "2036-06-10";
  const secondDate = "2036-06-11";

  const usdClientName = `M6 USD ${suffix}`;
  const usdClient = await createClient(request, usdClientName, "USD", "75.0000");
  const usdProjectName = `M6 History ${suffix}`;
  const usdProject = await createProject(request, usdClient, usdProjectName, "85.0000");
  const taskResponse = await request.post(`/api/v1/projects/${usdProject}/tasks`, {
    data: { name: `M6 Task ${suffix}` },
  });
  await expectOk(taskResponse);
  const taskId = (await taskResponse.json() as { task: { id: string } }).task.id;

  await createDuration(request, {
    clientId: usdClient,
    projectId: usdProject,
    taskId,
    workDate: firstDate,
    durationSeconds: 7_200,
    description: `Historical USD ${suffix}`,
    billable: true,
  });

  await expectOk(await request.patch(`/api/v1/projects/${usdProject}`, {
    data: {
      clientId: usdClient,
      name: usdProjectName,
      color: "",
      rateMode: "override",
      defaultHourlyRate: "125.0000",
      billableByDefault: true,
      note: "",
    },
  }));
  await expectOk(await request.patch(`/api/v1/clients/${usdClient}`, {
    data: {
      name: usdClientName,
      email: "",
      ccRecipients: [],
      address: "",
      note: "",
      currency: "GBP",
      rateMode: "override",
      defaultHourlyRate: "75.0000",
    },
  }));
  await createDuration(request, {
    clientId: usdClient,
    projectId: usdProject,
    taskId: null,
    workDate: secondDate,
    durationSeconds: 3_600,
    description: `Current GBP ${suffix}`,
    billable: true,
  });
  await createDuration(request, {
    clientId: usdClient,
    projectId: usdProject,
    taskId: null,
    workDate: secondDate,
    durationSeconds: 1_800,
    description: `Non-billable ${suffix}`,
    billable: false,
  });

  const eurClientName = `M6 EUR ${suffix}`;
  const eurClient = await createClient(request, eurClientName, "EUR", "55.0000");
  const eurProject = await createProject(request, eurClient, `M6 Euro ${suffix}`, "60.0000");
  await createDuration(request, {
    clientId: eurClient,
    projectId: eurProject,
    taskId: null,
    workDate: firstDate,
    durationSeconds: 3_600,
    description: `Euro work ${suffix}`,
    billable: true,
  });

  await page.goto(`/reports?from=${firstDate}&to=${secondDate}`);
  await expect(page).toHaveURL(new RegExp(`/reports/summary\\?from=${firstDate}&to=${secondDate}`));
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByText("4h 30m").first()).toBeVisible();
  await expect(page.getByText("4h").first()).toBeVisible();
  await expect(page.getByText("30m").first()).toBeVisible();
  await expect(page.getByText("$170.00", { exact: true })).toBeVisible();
  await expect(page.getByText("£125.00", { exact: true })).toBeVisible();
  await expect(page.getByText("€60.00", { exact: true })).toBeVisible();

  await page.getByLabel("Client", { exact: true }).selectOption({ label: `${usdClientName} — GBP` });
  await page.getByLabel("Project", { exact: true }).selectOption({ label: usdProjectName });
  await page.getByLabel("Billable state", { exact: true }).selectOption("billable");
  await expect(page).toHaveURL(new RegExp(`client=${usdClient}.*project=${usdProject}.*billable=billable`));
  await expect(page.getByText("3h").first()).toBeVisible();
  await expect(page.getByText("$170.00", { exact: true })).toBeVisible();
  await expect(page.getByText("£125.00", { exact: true })).toBeVisible();
  await expect(page.getByText("€60.00", { exact: true })).not.toBeVisible();

  await page.getByRole("link", { name: "Detailed" }).click();
  await expect(page).toHaveURL(new RegExp(`/reports/detailed.*client=${usdClient}.*project=${usdProject}.*billable=billable`));
  const table = page.getByRole("table");
  await expect(table).toContainText(`Historical USD ${suffix}`);
  await expect(table).toContainText("USD $85.00/hr");
  await expect(table).toContainText("USD $170.00");
  await expect(table).toContainText("GBP £125.00/hr");
  await expect(table).not.toContainText(`Euro work ${suffix}`);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/client=/);
  await expect(page.getByLabel("From")).not.toHaveValue(firstDate);
  await page.getByLabel("From").fill(firstDate);
  await expect(page).toHaveURL(new RegExp(`from=${firstDate}.*to=${firstDate}`));
  await page.getByLabel("To").fill(secondDate);
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`from=${firstDate}.*to=${secondDate}`));
  await expect(page.getByRole("heading", { name: "Detailed entries" })).toBeVisible();
  expect(consoleProblems).toEqual([]);
});

async function createClient(
  request: APIRequestContext,
  name: string,
  currency: string,
  rate: string,
): Promise<string> {
  const response = await request.post("/api/v1/clients", {
    data: { name, email: "", ccRecipients: [], address: "", note: "", currency, rateMode: "override", defaultHourlyRate: rate },
  });
  await expectOk(response);
  return (await response.json() as { client: { id: string } }).client.id;
}

async function createProject(request: APIRequestContext, clientId: string, name: string, rate: string): Promise<string> {
  const response = await request.post("/api/v1/projects", {
    data: { clientId, name, color: "", rateMode: "override", defaultHourlyRate: rate, billableByDefault: true, note: "" },
  });
  await expectOk(response);
  return (await response.json() as { project: { id: string } }).project.id;
}

async function createDuration(request: APIRequestContext, data: Record<string, unknown>): Promise<void> {
  await expectOk(await request.post("/api/v1/time-entries", { data: { mode: "duration", ...data } }));
}

async function expectOk(response: APIResponse): Promise<void> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBe(true);
}
