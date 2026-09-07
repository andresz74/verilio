import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
} from "@playwright/test";

test("completes the canonical private MVP loop with historical and billing integrity", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleProblems.push(message.text());
    }
  });

  const suffix = Date.now().toString().slice(-8);
  const workDate = currentDateInTimezone("America/New_York");
  const businessName = `MVP Studio ${suffix}`;
  const clientName = `MVP Client ${suffix}`;
  const projectName = `MVP Project ${suffix}`;
  const taskName = `MVP Task ${suffix}`;
  const timerDescription = `MVP timer ${suffix}`;
  const rangeDescription = `MVP range ${suffix}`;
  const durationDescription = `MVP duration ${suffix}`;
  const editedDurationDescription = `${durationDescription} edited`;
  const invoicePrefix = `MVP-${suffix}-`;

  await page.goto("/settings");
  await page.getByLabel(/Business or display name/).fill(businessName);
  await page.getByLabel(/^Email/).fill("billing@mvp.test");
  await page.getByLabel(/Business address/).fill("9 Release Gate Way");
  await page.getByLabel(/Timezone/).fill("America/New_York");
  await page.getByLabel(/Default currency/).fill("USD");
  await page.getByLabel(/Default hourly rate/).fill("70");
  await page.getByLabel(/Payment terms/).fill("14");
  await page.getByLabel(/Default tax/).fill("6");
  await page.getByLabel(/Invoice prefix/).fill(invoicePrefix);
  await page.getByLabel(/Next invoice number/).fill("1");
  await page.getByLabel(/Default invoice notes/).fill("Saved MVP notes");
  await page.getByLabel(/Invoice footer/).fill("Saved MVP footer");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");

  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).click();
  let dialog = page.getByRole("dialog", { name: "Create client" });
  await dialog.getByLabel(/Client name/).fill(clientName);
  await dialog.getByLabel(/Currency/).fill("USD");
  await dialog.getByLabel("Override hourly rate").check();
  await dialog.getByLabel(/Hourly rate override/).fill("80");
  await dialog.getByLabel(/Address/).fill("80 Client Avenue");
  await dialog.getByRole("button", { name: "Create client" }).click();
  const clientRow = page.getByRole("row", { name: new RegExp(clientName) });
  await expect(clientRow).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  dialog = page.getByRole("dialog", { name: "Create project" });
  await dialog
    .getByRole("combobox", { name: /^Client/ })
    .selectOption({ label: `${clientName} — USD` });
  await dialog.getByLabel(/Project name/).fill(projectName);
  await dialog.getByLabel("Override hourly rate").check();
  await dialog.getByLabel(/Hourly rate override/).fill("85");
  await dialog.getByRole("button", { name: "Create project" }).click();
  const projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await projectRow.getByRole("link", { name: projectName }).click();
  await page.getByRole("button", { name: "Add task" }).click();
  dialog = page.getByRole("dialog", { name: "Create task" });
  await dialog.getByLabel(/Task name/).fill(taskName);
  await dialog.getByRole("button", { name: "Create task" }).click();

  const clientId = await findClientId(request, clientName);
  const projectId = await findProjectId(request, clientId, projectName);

  await page.goto("/timer");
  const composer = page.getByRole("region", { name: "What are you working on?" });
  await composer.getByLabel("Description").fill(timerDescription);
  await composer.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await composer.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await composer.getByRole("combobox", { name: "Task (optional)" }).selectOption({ label: taskName });
  await composer.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("region", { name: "Running timer" })).toContainText(
    timerDescription,
  );

  await page.getByRole("link", { name: "Clients" }).click();
  await expect(
    page.getByRole("navigation").getByRole("link", { name: timerDescription }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: `Running timer: ${timerDescription}` }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: `Running timer: ${timerDescription}` }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("navigation").getByRole("link", { name: timerDescription }).click();
  await page.getByRole("region", { name: "Running timer" }).getByRole("button", {
    name: "Stop",
  }).click();
  const timerEntry = page.locator("article").filter({ hasText: timerDescription });
  await expect(timerEntry).toContainText("85.0000/hr");

  const settings = await getSettings(request);
  await expectOk(
    await request.put("/api/v1/settings", {
      data: {
        ...settings,
        phone: settings.phone ?? "",
        taxIdentifier: settings.taxIdentifier ?? "",
        defaultInvoiceNotes: settings.defaultInvoiceNotes ?? "",
        invoiceFooter: settings.invoiceFooter ?? "",
        defaultHourlyRate: "160.0000",
      },
    }),
  );
  await expectOk(
    await request.patch(`/api/v1/clients/${clientId}`, {
      data: {
        name: clientName,
        email: "",
        ccRecipients: [],
        address: "80 Client Avenue",
        note: "",
        currency: "USD",
        rateMode: "override",
        defaultHourlyRate: "140.0000",
      },
    }),
  );
  await expectOk(
    await request.patch(`/api/v1/projects/${projectId}`, {
      data: {
        clientId,
        name: projectName,
        color: "",
        rateMode: "override",
        defaultHourlyRate: "125.0000",
        billableByDefault: true,
        note: "",
      },
    }),
  );

  await page.getByRole("button", { name: "Add time" }).click();
  dialog = page.getByRole("dialog", { name: "Add time manually" });
  await dialog.getByLabel(/Work date/).fill(workDate);
  await dialog.getByLabel("Description").fill(rangeDescription);
  await dialog.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await dialog.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await dialog.getByLabel("Billable").uncheck();
  await dialog.getByRole("button", { name: "Add time" }).click();

  await page.getByRole("button", { name: "Add time" }).click();
  dialog = page.getByRole("dialog", { name: "Add time manually" });
  await dialog.getByRole("radio", { name: "Duration" }).check();
  await dialog.getByLabel(/Work date/).fill(workDate);
  await dialog.getByPlaceholder("1:30 or 90m").fill("2:00");
  await dialog.getByLabel("Description").fill(durationDescription);
  await dialog.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await dialog.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await dialog.getByRole("combobox", { name: "Task (optional)" }).selectOption({ label: taskName });
  await dialog.getByRole("button", { name: "Add time" }).click();

  await page.goto(`/timesheet?from=${workDate}&to=${workDate}`);
  await expect(page.getByText(timerDescription)).toBeVisible();
  await expect(page.getByText(rangeDescription)).toBeVisible();
  const durationRow = page.locator("article").filter({ hasText: durationDescription });
  await expect(durationRow).toContainText("2h");
  await durationRow.getByRole("button", { name: "Edit" }).click();
  dialog = page.getByRole("dialog", { name: "Edit time entry" });
  await dialog.getByLabel("Description").fill(editedDurationDescription);
  await dialog.getByPlaceholder("1:30 or 90m").fill("2:30");
  await dialog.getByRole("button", { name: "Save entry" }).click();
  await expect(
    page.locator("article").filter({ hasText: editedDurationDescription }),
  ).toContainText("2h 30m");

  await page.goto(`/reports/summary?from=${workDate}&to=${workDate}`);
  await page.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await page.getByRole("combobox", { name: "Project" }).selectOption({ label: projectName });
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
  await expect(page.getByText("1h", { exact: true }).first()).toBeVisible();

  const summary = await getJson<{
    totalTrackedSeconds: number;
    billableSeconds: number;
    nonBillableSeconds: number;
    billableTotals: Array<{ currency: string; amount: string }>;
  }>(
    await request.get(
      `/api/v1/reports/summary?from=${workDate}&to=${workDate}&clientId=${clientId}&projectId=${projectId}&billable=all&invoiceStatus=all&groupBy=project`,
    ),
  );
  expect(summary.nonBillableSeconds).toBe(3_600);
  expect(summary.billableSeconds).toBeGreaterThanOrEqual(9_001);
  expect(summary.totalTrackedSeconds).toBe(
    summary.billableSeconds + summary.nonBillableSeconds,
  );
  expect(summary.billableTotals).toEqual([
    expect.objectContaining({ currency: "USD" }),
  ]);

  await page.getByRole("link", { name: "Detailed" }).click();
  const reportTable = page.getByRole("table");
  await expect(reportTable).toContainText(timerDescription);
  await expect(reportTable).toContainText("USD $85.00/hr");
  await expect(reportTable).toContainText("USD $125.00/hr");
  await expect(reportTable).toContainText("Not invoiced");

  await page.goto("/invoices/new");
  await page.getByRole("combobox", { name: "Client" }).selectOption({ label: `${clientName} — USD` });
  await expect(page.getByLabel("Invoice currency")).toHaveValue("USD");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page).toHaveURL(/\/invoices\/[0-9a-f-]+$/);
  const invoiceId = page.url().split("/").at(-1)!;
  const invoiceHeading = page.getByRole("heading", {
    level: 1,
    name: new RegExp(`^${invoicePrefix}`),
  });
  const invoiceNumber = (await invoiceHeading.textContent())!;

  await page.getByRole("button", { name: "Import Time" }).click();
  dialog = page.getByRole("dialog", { name: "Import eligible Time" });
  await expect(dialog.getByLabel("Grouping")).toHaveValue("project");
  await dialog.getByLabel("From").fill(workDate);
  await dialog.getByLabel("To").fill(workDate);
  await expect(dialog).toContainText("2 eligible");
  await dialog.getByRole("button", { name: "Select all" }).click();
  await dialog.getByRole("button", { name: "Import 2 selected" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("View 1 source entry")).toHaveCount(2);

  await page.getByRole("button", { name: "Add manual Item" }).click();
  dialog = page.getByRole("dialog", { name: "Add manual Item" });
  await dialog.getByLabel("Description").fill(`MVP manual Item ${suffix}`);
  await dialog.getByLabel("Quantity").fill("1");
  await dialog.getByLabel(/Unit price/).fill("50");
  await dialog.getByRole("button", { name: "Save Item" }).click();
  await expect(page.getByText(`MVP manual Item ${suffix}`)).toBeVisible();
  await page.getByLabel("Discount type").selectOption("percentage");
  await expect(page.getByLabel("Discount percent")).toBeEnabled();
  await page.getByLabel("Discount percent").fill("10");
  await page.getByLabel("Tax percent").fill("6");
  await page.getByRole("button", { name: "Save Draft" }).click();

  const savedInvoice = await getJson<{ invoice: {
    invoiceNumber: string;
    subtotal: string;
    discountAmount: string;
    taxAmount: string;
    total: string;
    items: Array<{ kind: string; unitPrice: string; sources: Array<{ id: string }> }>;
  } }>(await request.get(`/api/v1/invoices/${invoiceId}`));
  expect(savedInvoice.invoice.invoiceNumber).toBe(invoiceNumber);
  expect(savedInvoice.invoice.items.filter((item) => item.kind === "time").map((item) => item.unitPrice).sort()).toEqual([
    "125.0000",
    "85.0000",
  ]);
  await expect(page.getByText(`USD ${formatMoney(savedInvoice.invoice.total, "USD")}`)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: invoiceNumber })).toBeVisible();

  const secondDraft = await createInvoice(request, clientId, workDate);
  const secondEligible = await getJson<{ count: number }>(
    await request.get(
      `/api/v1/invoices/${secondDraft}/eligible-time?from=${workDate}&to=${workDate}`,
    ),
  );
  expect(secondEligible.count).toBe(0);

  await expectOk(
    await request.patch(`/api/v1/clients/${clientId}`, {
      data: {
        name: clientName,
        email: "",
        ccRecipients: [],
        address: "Changed after Invoice save",
        note: "",
        currency: "USD",
        rateMode: "override",
        defaultHourlyRate: "140.0000",
      },
    }),
  );
  const currentSettings = await getSettings(request);
  await expectOk(
    await request.put("/api/v1/settings", {
      data: {
        ...currentSettings,
        phone: currentSettings.phone ?? "",
        taxIdentifier: currentSettings.taxIdentifier ?? "",
        defaultInvoiceNotes: currentSettings.defaultInvoiceNotes ?? "",
        invoiceFooter: currentSettings.invoiceFooter ?? "",
        businessName: "Changed after Invoice save",
        defaultHourlyRate: "160.0000",
      },
    }),
  );

  await page.getByRole("button", { name: "Preview" }).click();
  dialog = page.getByRole("dialog", { name: `Preview ${invoiceNumber}` });
  await expect(dialog).toContainText(businessName);
  await expect(dialog).toContainText(clientName);
  await expect(dialog).not.toContainText("Changed after Invoice save");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    `invoice-${invoiceNumber}.pdf`,
  );
  const pdf = await request.get(`/api/v1/invoices/${invoiceId}/pdf`);
  await expectOk(pdf);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("button", { name: "Mark Sent" }).click();
  dialog = page.getByRole("dialog", { name: `Mark ${invoiceNumber} as sent?` });
  await dialog.getByRole("button", { name: "Mark Sent" }).click();
  await expect(page.getByRole("button", { name: "Mark Paid" })).toBeVisible();
  await page.getByRole("button", { name: "Mark Paid" }).click();
  dialog = page.getByRole("dialog", { name: `Mark ${invoiceNumber} as paid?` });
  await dialog.getByLabel("Paid date").fill(workDate);
  await dialog.getByRole("button", { name: "Mark Paid" }).click();
  await expect(page.getByText(`Paid on ${workDate}`)).toBeVisible();
  await expect(page.getByLabel("Notes")).toBeDisabled();
  await page.getByText("View 1 source entry").first().click();
  await expect(page.getByText(timerDescription)).toBeVisible();

  await page.goto(
    `/reports/detailed?from=${workDate}&to=${workDate}&client=${clientId}&project=${projectId}&invoiceStatus=invoiced`,
  );
  await expect(page.getByRole("table")).toContainText(timerDescription);
  await expect(page.getByRole("table")).toContainText(invoiceNumber);
  await page.goto(`/timesheet?from=${workDate}&to=${workDate}`);
  await expect(page.getByRole("link", { name: `View ${invoiceNumber}` }).first()).toBeVisible();

  expect(consoleProblems).toEqual([]);
});

async function getSettings(request: APIRequestContext): Promise<Record<string, unknown>> {
  const response = await getJson<{ settings: Record<string, unknown> }>(
    await request.get("/api/v1/settings"),
  );
  return response.settings;
}

async function findClientId(request: APIRequestContext, name: string): Promise<string> {
  const response = await getJson<{ clients: Array<{ id: string; name: string }> }>(
    await request.get(`/api/v1/clients?status=active&search=${encodeURIComponent(name)}`),
  );
  return response.clients.find((client) => client.name === name)!.id;
}

async function findProjectId(
  request: APIRequestContext,
  clientId: string,
  name: string,
): Promise<string> {
  const response = await getJson<{ projects: Array<{ id: string; name: string }> }>(
    await request.get(
      `/api/v1/projects?status=active&clientId=${clientId}&search=${encodeURIComponent(name)}`,
    ),
  );
  return response.projects.find((project) => project.name === name)!.id;
}

async function createInvoice(
  request: APIRequestContext,
  clientId: string,
  issueDate: string,
): Promise<string> {
  const response = await getJson<{ invoice: { id: string } }>(
    await request.post("/api/v1/invoices", {
      data: {
        clientId,
        currency: "USD",
        issueDate,
        dueDate: issueDate,
        discountType: "none",
        discountValue: "0",
        taxPercent: "0",
        notes: "",
      },
    }),
  );
  return response.invoice.id;
}

async function getJson<T>(response: APIResponse): Promise<T> {
  await expectOk(response);
  return (await response.json()) as T;
}

async function expectOk(response: APIResponse): Promise<void> {
  expect(response.ok(), `${response.url()}: ${await response.text()}`).toBe(true);
}

function currentDateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatMoney(value: string, currency: string): string {
  return new Intl.NumberFormat("en-US", { currency, style: "currency" }).format(
    Number(value),
  );
}
