import { expect, test } from "@playwright/test";

test("navigates the required M1 shell and exposes the active section", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Verilio");
  await expect(page).toHaveURL(/\/timer$/);
  await expect(page.getByRole("heading", { name: "Timer" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Timer" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  await page.getByRole("link", { name: "Reports" }).click();
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Reports" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("saves settings and reloads all M1 billing defaults", async ({ page }) => {
  await page.goto("/settings");

  await page.getByLabel(/Business or display name/).fill("Verilio E2E Studio");
  await page.getByLabel(/^Email/).fill("billing@verilio.test");
  await page.getByLabel(/Business address/).fill("42 Ledger Lane\nNew York, NY");
  await page.getByLabel(/Phone/).fill("+1 212 555 0199");
  await page.getByLabel(/Tax identifier/).fill("TAX-E2E");
  await page.getByLabel(/Timezone/).fill("America/New_York");
  await page.getByLabel(/Default currency/).fill("USD");
  await page.getByLabel(/Default hourly rate/).fill("125.5000");
  await page.getByLabel(/Payment terms/).fill("21");
  await page.getByLabel(/Default tax/).fill("8.8750");
  await page.getByLabel(/Invoice prefix/).fill("E2E-");
  await page.getByLabel(/Next invoice number/).fill("73");
  await page.getByLabel(/Default invoice notes/).fill("Thank you for your business.");
  await page.getByLabel(/Invoice footer/).fill("Payment due within 21 days.");

  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved.");

  await page.reload();

  await expect(page.getByLabel(/Business or display name/)).toHaveValue(
    "Verilio E2E Studio",
  );
  await expect(page.getByLabel(/Default currency/)).toHaveValue("USD");
  await expect(page.getByLabel(/Default hourly rate/)).toHaveValue("125.5000");
  await expect(page.getByLabel(/Payment terms/)).toHaveValue("21");
  await expect(page.getByLabel(/Invoice prefix/)).toHaveValue("E2E-");
  await expect(page.getByLabel(/Next invoice number/)).toHaveValue("73");
  await expect(page.getByLabel(/Default tax/)).toHaveValue("8.8750");
  await expect(page.getByLabel(/Default invoice notes/)).toHaveValue(
    "Thank you for your business.",
  );
  await expect(page.getByLabel(/Invoice footer/)).toHaveValue(
    "Payment due within 21 days.",
  );
});
