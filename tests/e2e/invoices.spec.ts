import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

test("completes Draft → PDF → Sent → Paid while preserving reserved historical Time", async ({ page, request }) => {
  test.setTimeout(60_000);
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });

  const suffix = Date.now().toString().slice(-8);
  const firstDate = "2037-07-10";
  const secondDate = "2037-07-11";
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
  await page.getByRole("button", { name: "Preview" }).click();
  dialog = page.getByRole("dialog", { name: `Preview ${invoiceNumber}` });
  await expect(dialog).toContainText(`M7 Studio ${suffix}`);
  await expect(dialog).toContainText(clientName);
  await expect(dialog).toContainText("USD $200.34");
  await expect(dialog).toContainText("Payment due within 30 days");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`invoice-${invoiceNumber}.pdf`);
  const pdfResponse = await request.get(`/api/v1/invoices/${invoiceId}/pdf`);
  await expectOk(pdfResponse);
  expect(pdfResponse.headers()["content-type"]).toBe("application/pdf");
  expect((await pdfResponse.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Mark Sent" }).click();
  dialog = page.getByRole("dialog", { name: `Mark ${invoiceNumber} as sent?` });
  await expect(dialog).toContainText("will not email");
  await dialog.getByRole("button", { name: "Mark Sent" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Paid" })).toBeVisible();
  await expect(page.getByLabel("Notes")).toBeDisabled();

  await page.getByRole("button", { name: "Mark Paid" }).click();
  dialog = page.getByRole("dialog", { name: `Mark ${invoiceNumber} as paid?` });
  await dialog.getByLabel("Paid date").fill(firstDate);
  await dialog.getByRole("button", { name: "Mark Paid" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText(`Paid on ${firstDate}`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
  expect((await eligibleTime(request, secondUsdInvoice, firstDate, secondDate)).count).toBe(0);
  await page.goto(`/reports/detailed?from=${firstDate}&to=${secondDate}&invoiceStatus=invoiced`);
  await expect(page.getByRole("table")).toContainText(firstDescription);
  await page.goto(`/timesheet?from=${firstDate}&to=${secondDate}`);
  await expect(page.getByRole("link", { name: `View ${invoiceNumber}` }).first()).toBeVisible();
  expect(firstEntryId).toBeTruthy();
  expect(consoleProblems).toEqual([]);
});

test("Void preserves Invoice history, releases Time, and permits re-invoicing", async ({ page, request }) => {
  test.setTimeout(60_000);
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleProblems.push(message.text());
  });
  const suffix = Date.now().toString().slice(-8);
  const workDate = `33${suffix.slice(0, 2)}-${String((Number(suffix.slice(2, 4)) % 12) + 1).padStart(2, "0")}-15`;
  const settingsResponse = await request.get("/api/v1/settings");
  await expectOk(settingsResponse);
  const current = (await settingsResponse.json() as { settings: Record<string, unknown> }).settings;
  await expectOk(await request.put("/api/v1/settings", { data: {
    ...current,
    businessName: `M8 Void Studio ${suffix}`,
    invoicePrefix: `V8-${suffix}-`,
    defaultCurrency: "USD",
    defaultHourlyRate: "80.0000",
    paymentTermsDays: 14,
    defaultTaxRate: "0",
    defaultInvoiceNotes: "Void scenario",
    invoiceFooter: "Saved M8 footer",
    timezone: "America/New_York",
  } }));
  const clientId = await createClient(request, `M8 Void Client ${suffix}`, "USD");
  const projectId = await createProject(request, clientId, `M8 Void Project ${suffix}`, "90.0000");
  const entryId = await createDuration(request, { clientId, projectId, taskId: null, workDate, durationSeconds: 3_600, description: `Void source ${suffix}`, billable: true });
  const invoiceId = await createInvoice(request, clientId, "USD", workDate);
  const importResponse = await request.post(`/api/v1/invoices/${invoiceId}/import-time`, { data: { from: workDate, to: workDate, timeEntryIds: [entryId], grouping: "project" } });
  await expectOk(importResponse);
  const invoiceNumber = (await importResponse.json() as { invoice: { invoiceNumber: string } }).invoice.invoiceNumber;

  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByText("View 1 source entry")).toBeVisible();
  await page.getByRole("button", { name: "Mark Sent" }).click();
  await page.getByRole("dialog", { name: `Mark ${invoiceNumber} as sent?` }).getByRole("button", { name: "Mark Sent" }).click();
  await page.getByRole("button", { name: "Void Invoice" }).click();
  const dialog = page.getByRole("dialog", { name: `Void ${invoiceNumber}?` });
  await expect(dialog).toContainText("available to Invoice again");
  await dialog.getByRole("button", { name: "Void Invoice" }).click();
  await expect(page.getByText(/Void is terminal/)).toBeVisible();
  await expect(page.getByText("View 1 source entry")).toBeVisible();
  await expect(page.getByRole("heading", { name: invoiceNumber })).toBeVisible();

  const replacementId = await createInvoice(request, clientId, "USD", workDate);
  const released = await eligibleTime(request, replacementId, workDate, workDate);
  expect(released.entries.map((entry) => entry.id)).toContain(entryId);
  await expectOk(await request.post(`/api/v1/invoices/${replacementId}/import-time`, { data: { from: workDate, to: workDate, timeEntryIds: [entryId], grouping: "individual" } }));
  const oldInvoice = await request.get(`/api/v1/invoices/${invoiceId}`);
  await expectOk(oldInvoice);
  expect((await oldInvoice.json() as { invoice: { invoiceNumber: string; status: string; items: Array<{ sources: Array<{ id: string }> }> } }).invoice).toMatchObject({ invoiceNumber, status: "void", items: [{ sources: [{ id: entryId }] }] });
  await page.goto(`/reports/detailed?from=${workDate}&to=${workDate}&invoiceStatus=invoiced`);
  await expect(page.getByRole("table")).toContainText(`Void source ${suffix}`);
  await page.goto(`/timesheet?from=${workDate}&to=${workDate}`);
  await expect(page.getByRole("link", { name: /^View V8-/ })).toBeVisible();
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
