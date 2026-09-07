import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

test("creates a traceable Draft and reserves/releases historical Time through the M7 exit gate", async ({ page, request }) => {
  test.setTimeout(60_000);
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });

  const suffix = Date.now().toString().slice(-8);
  const dateSlot = Math.floor(Date.now() / 1_000) % 84_000;
  const year = 3_200 + Math.floor(dateSlot / 12);
  const month = dateSlot % 12 + 1;
  const monthText = String(month).padStart(2, "0");
  const firstDate = `${year}-${monthText}-10`;
  const secondDate = `${year}-${monthText}-11`;
  const invoicePrefix = `M7-${suffix}-`;

  const settingsResponse = await request.get("/api/v1/settings");
  await expectOk(settingsResponse);
  const currentSettings = (await settingsResponse.json() as { settings: Record<string, unknown> | null }).settings;
  const nextInvoiceNumber = typeof currentSettings?.nextInvoiceNumber === "number" ? currentSettings.nextInvoiceNumber : 1;
  await expectOk(await request.put("/api/v1/settings", { data: {
    businessName: `M7 Studio ${suffix}`,
    email: "billing@example.com",
    address: "7 Seller Road",
    phone: "555-0100",
    taxIdentifier: "TAX-7",
    defaultCurrency: "USD",
    defaultHourlyRate: "70.0000",
    paymentTermsDays: 30,
    invoicePrefix,
    nextInvoiceNumber,
    defaultTaxRate: "6.0000",
    defaultInvoiceNotes: "Thank you",
    invoiceFooter: "",
    timezone: "America/New_York",
  } }));

  const clientName = `M7 Client ${suffix}`;
  const clientId = await createClient(request, clientName, "USD");
  const projectName = `M7 Project ${suffix}`;
  const projectId = await createProject(request, clientId, projectName, "85.0000");
  const taskResponse = await request.post(`/api/v1/projects/${projectId}/tasks`, { data: { name: `M7 Task ${suffix}` } });
  await expectOk(taskResponse);
  const taskId = (await taskResponse.json() as { task: { id: string } }).task.id;

  const firstDescription = `Historical 85 ${suffix}`;
  const firstEntryId = await createDuration(request, { clientId, projectId, taskId, workDate: firstDate, durationSeconds: 3_600, description: firstDescription, billable: true });
  await expectOk(await request.patch(`/api/v1/projects/${projectId}`, { data: { clientId, name: projectName, color: "", rateMode: "override", defaultHourlyRate: "100.0000", billableByDefault: true, note: "" } }));
  const secondDescription = `Historical 100 ${suffix}`;
  await createDuration(request, { clientId, projectId, taskId: null, workDate: secondDate, durationSeconds: 3_600, description: secondDescription, billable: true });

  await page.goto(`/reports/detailed?from=${firstDate}&to=${secondDate}&invoiceStatus=not-invoiced`);
  await expect(page.getByRole("table")).toContainText(firstDescription);
  await expect(page.getByRole("table")).toContainText(secondDescription);

  await page.goto("/invoices/new");
  await page.getByLabel("Client", { exact: true }).selectOption({ label: `${clientName} — USD` });
  await expect(page.getByLabel("Invoice currency")).toHaveValue("USD");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
  const invoiceId = page.url().split("/").at(-1)!;
  const invoiceHeading = page.getByRole("heading", { level: 1, name: new RegExp(`^${invoicePrefix}`) });
  await expect(invoiceHeading).toBeVisible();
  const invoiceNumber = (await invoiceHeading.textContent())!;
  expect(invoiceNumber).toMatch(new RegExp(`^${invoicePrefix}`));

  await page.getByRole("button", { name: "Import Time" }).click();
  let dialog = page.getByRole("dialog", { name: "Import eligible Time" });
  await expect(dialog.getByLabel("Grouping")).toHaveValue("project");
  await dialog.getByLabel("To").fill(secondDate);
  await dialog.getByLabel("From").fill(firstDate);
  await expect(dialog).toContainText("2 eligible");
  await dialog.getByRole("button", { name: "Select all" }).click();
  await dialog.getByRole("button", { name: "Import 2 selected" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("View 1 source entry")).toHaveCount(2);
  await page.getByText("View 1 source entry").first().click();
  await expect(page.getByText(new RegExp(`Historical 85.*USD \\$85\\.00/hr.*USD \\$85\\.00`))).toBeVisible();

  await page.getByRole("button", { name: "Add manual Item" }).click();
  dialog = page.getByRole("dialog", { name: "Add manual Item" });
  await dialog.getByLabel("Description").fill(`Manual support ${suffix}`);
  await dialog.getByLabel("Quantity").fill("1");
  await dialog.getByLabel(/Unit price/).fill("25");
  await dialog.getByRole("button", { name: "Save Item" }).click();
  await expect(page.getByText(`Manual support ${suffix}`)).toBeVisible();
  await page.getByLabel("Discount type").selectOption("percentage");
  await page.getByLabel("Discount percent").fill("10");
  await page.getByLabel("Tax percent").fill("6");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByText("USD $200.34")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: invoiceNumber })).toBeVisible();
  await expect(page.getByText("USD $200.34")).toBeVisible();

  await expectOk(await request.patch(`/api/v1/clients/${clientId}`, { data: { name: clientName, email: "", ccRecipients: [], address: "", note: "", currency: "GBP", rateMode: "override", defaultHourlyRate: "75.0000" } }));
  const gbpInvoice = await createInvoice(request, clientId, "GBP", firstDate);
  expect((await eligibleTime(request, gbpInvoice, firstDate, secondDate)).count).toBe(0);

  await page.goto(`/reports/detailed?from=${firstDate}&to=${secondDate}&invoiceStatus=invoiced`);
  const report = page.getByRole("table");
  await expect(report).toContainText(firstDescription);
  await expect(report).toContainText("USD $85.00/hr");
  await expect(report.getByRole("link", { name: invoiceNumber }).first()).toHaveAttribute("href", `/invoices/${invoiceId}`);
  await page.goto(`/timesheet?from=${firstDate}&to=${secondDate}`);
  await expect(page.getByRole("link", { name: `View ${invoiceNumber}` }).first()).toHaveAttribute("href", `/invoices/${invoiceId}`);

  const secondUsdInvoice = await createInvoice(request, clientId, "USD", firstDate);
  expect((await eligibleTime(request, secondUsdInvoice, firstDate, secondDate)).count).toBe(0);

  await page.goto(`/invoices/${invoiceId}`);
  const sourceRow = page.getByRole("row").filter({ hasText: firstDescription });
  await sourceRow.getByRole("button", { name: "Remove" }).click();
  dialog = page.getByRole("dialog", { name: new RegExp("Remove") });
  await expect(dialog).toContainText("eligible again");
  await dialog.getByRole("button", { name: "Remove Item" }).click();
  await expect(dialog).not.toBeVisible();
  const released = await eligibleTime(request, secondUsdInvoice, firstDate, secondDate);
  expect(released.entries.map((entry: { id: string }) => entry.id)).toContain(firstEntryId);

  await page.goto(`/reports/detailed?from=${firstDate}&to=${secondDate}&invoiceStatus=not-invoiced`);
  await expect(page.getByRole("table")).toContainText(firstDescription);
  expect(consoleProblems).toEqual([]);
});

async function createClient(request: APIRequestContext, name: string, currency: string): Promise<string> {
  const response = await request.post("/api/v1/clients", { data: { name, email: "", ccRecipients: [], address: "", note: "", currency, rateMode: "override", defaultHourlyRate: "75.0000" } });
  await expectOk(response);
  return (await response.json() as { client: { id: string } }).client.id;
}

async function createProject(request: APIRequestContext, clientId: string, name: string, rate: string): Promise<string> {
  const response = await request.post("/api/v1/projects", { data: { clientId, name, color: "", rateMode: "override", defaultHourlyRate: rate, billableByDefault: true, note: "" } });
  await expectOk(response);
  return (await response.json() as { project: { id: string } }).project.id;
}

async function createDuration(request: APIRequestContext, data: Record<string, unknown>): Promise<string> {
  const response = await request.post("/api/v1/time-entries", { data: { mode: "duration", ...data } });
  await expectOk(response);
  return (await response.json() as { entry: { id: string } }).entry.id;
}

async function createInvoice(request: APIRequestContext, clientId: string, currency: string, issueDate: string): Promise<string> {
  const response = await request.post("/api/v1/invoices", { data: { clientId, currency, issueDate, dueDate: issueDate, discountType: "none", discountValue: "0", taxPercent: "0", notes: "" } });
  await expectOk(response);
  return (await response.json() as { invoice: { id: string } }).invoice.id;
}

async function eligibleTime(request: APIRequestContext, invoiceId: string, from: string, to: string) {
  const response = await request.get(`/api/v1/invoices/${invoiceId}/eligible-time?from=${from}&to=${to}`);
  await expectOk(response);
  return response.json() as Promise<{ count: number; entries: Array<{ id: string }> }>;
}

async function expectOk(response: APIResponse): Promise<void> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBe(true);
}
