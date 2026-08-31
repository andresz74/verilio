import { expect, test } from "@playwright/test";

test("opens the Verilio foundation app", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Verilio");
  await expect(
    page.getByRole("heading", { name: "Track your work. Bill with confidence." }),
  ).toBeVisible();
});

