import { expect, test } from "@playwright/test";

test("creates, edits, archives, persists, and reactivates a client", async ({ page }) => {
  const suffix = Date.now().toString().slice(-8);
  const clientName = `Northstar ${suffix}`;
  const updatedName = `${clientName} Labs`;

  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).click();

  const createDialog = page.getByRole("dialog", { name: "Create client" });
  await expect(createDialog).toBeVisible();
  await createDialog.getByLabel(/Client name/).fill(clientName);
  await createDialog.getByLabel(/^Email/).fill(`billing-${suffix}@northstar.test`);
  await createDialog.getByLabel("CC recipient 1").fill(`accounts-${suffix}@northstar.test`);
  await createDialog.getByLabel(/Currency/).fill("EUR");
  await createDialog.getByLabel("Override hourly rate").check();
  await createDialog.getByLabel(/Hourly rate override/).fill("110.2500");
  await createDialog.getByLabel(/Address/).fill("8 Market Street");
  await createDialog.getByLabel(/Note/).fill("Monthly billing");
  await createDialog.getByRole("button", { name: "Create client" }).click();

  let row = page.getByRole("row", { name: new RegExp(clientName) });
  await expect(row).toContainText("EUR");
  await expect(row).toContainText("110.2500/hr");

  await row.getByRole("button", { name: "Edit" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit client" });
  await editDialog.getByLabel(/Client name/).fill(updatedName);
  await editDialog.getByLabel(/Currency/).fill("GBP");
  await editDialog.getByLabel(/Use business default/).check();
  await editDialog.getByRole("button", { name: "Save client" }).click();

  row = page.getByRole("row", { name: new RegExp(updatedName) });
  await expect(row).toContainText("GBP");
  await expect(row).toContainText("Uses business default");

  await row.getByRole("button", { name: "Archive" }).click();
  const archiveDialog = page.getByRole("dialog", { name: `Archive ${updatedName}?` });
  await expect(archiveDialog).toContainText("Historical time and invoices will remain available");
  await archiveDialog.getByRole("button", { name: "Archive client" }).click();
  await expect(row).not.toBeVisible();

  await page.getByLabel("Status").selectOption("archived");
  row = page.getByRole("row", { name: new RegExp(updatedName) });
  await expect(row).toContainText("Archived");

  await page.reload();
  row = page.getByRole("row", { name: new RegExp(updatedName) });
  await expect(row).toContainText("Archived");
  await row.getByRole("button", { name: "Reactivate" }).click();
  await expect(row).not.toBeVisible();

  await page.getByLabel("Status").selectOption("active");
  row = page.getByRole("row", { name: new RegExp(updatedName) });
  await expect(row).toContainText("Active");
  await expect(row).toContainText("Uses business default");
});
