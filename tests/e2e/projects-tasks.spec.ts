import { expect, test } from "@playwright/test";

test("creates and preserves the Client to Project to Task hierarchy", async ({ page }) => {
  const suffix = Date.now().toString().slice(-8);
  const clientName = `M3 Client ${suffix}`;
  const projectName = `M3 Project ${suffix}`;
  const taskName = `Discovery ${suffix}`;
  const renamedTask = `Delivery ${suffix}`;

  await page.goto("/clients");
  await page.getByRole("button", { name: "New client" }).click();
  const clientDialog = page.getByRole("dialog", { name: "Create client" });
  await clientDialog.getByLabel(/Client name/).fill(clientName);
  await clientDialog.getByLabel(/Currency/).fill("USD");
  await clientDialog.getByLabel("Override hourly rate").check();
  await clientDialog.getByLabel(/Hourly rate override/).fill("95");
  await clientDialog.getByRole("button", { name: "Create client" }).click();
  await expect(page.getByRole("row", { name: new RegExp(clientName) })).toBeVisible();

  await page.goto("/projects");
  await page.getByRole("button", { name: "New project" }).click();
  const projectDialog = page.getByRole("dialog", { name: "Create project" });
  await projectDialog.getByRole("combobox", { name: /^Client/ }).selectOption({
    label: `${clientName} — USD`,
  });
  await projectDialog.getByLabel(/Project name/).fill(projectName);
  await expect(projectDialog.getByLabel(/Use inherited rate/)).toBeChecked();
  await expect(projectDialog.getByText(/Use inherited rate/)).toContainText("Client");
  await expect(projectDialog.getByText(/Use inherited rate/)).toContainText("95");
  await projectDialog.getByLabel("Color").fill("#4338CA");
  await projectDialog.getByLabel("Note").fill("M3 browser verification");
  await projectDialog.getByRole("button", { name: "Create project" }).click();

  let projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await expect(projectRow).toContainText(clientName);
  await expect(projectRow).toContainText("Inherits Client 95.0000/hr");

  await projectRow.getByRole("button", { name: "Edit" }).click();
  const editProject = page.getByRole("dialog", { name: "Edit project" });
  await editProject.getByLabel("Override hourly rate").check();
  await editProject.getByLabel(/Hourly rate override/).fill("135.25");
  await editProject.getByRole("button", { name: "Save project" }).click();
  projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await expect(projectRow).toContainText("135.2500/hr override");

  await projectRow.getByRole("link", { name: new RegExp(projectName) }).click();
  await expect(page.getByRole("heading", { level: 1, name: projectName })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Settings" })).toBeVisible();

  await page.getByRole("button", { name: "Add task" }).click();
  const createTask = page.getByRole("dialog", { name: "Create task" });
  await createTask.getByLabel(/Task name/).fill(taskName);
  await createTask.getByRole("button", { name: "Create task" }).click();

  let taskRow = page.getByRole("row", { name: new RegExp(taskName) });
  await expect(taskRow).toContainText("Active");
  await taskRow.getByRole("button", { name: "Rename" }).click();
  const renameTask = page.getByRole("dialog", { name: "Rename task" });
  await renameTask.getByLabel(/Task name/).fill(renamedTask);
  await renameTask.getByRole("button", { name: "Save task" }).click();

  taskRow = page.getByRole("row", { name: new RegExp(renamedTask) });
  await taskRow.getByRole("button", { name: "Archive" }).click();
  const archiveTask = page.getByRole("dialog", { name: `Archive ${renamedTask}?` });
  await expect(archiveTask).toContainText("historical relationships remain intact");
  await archiveTask.getByRole("button", { name: "Archive task" }).click();
  await expect(taskRow).not.toBeVisible();

  await page.getByLabel("Task status").selectOption("archived");
  taskRow = page.getByRole("row", { name: new RegExp(renamedTask) });
  await expect(taskRow).toContainText("Archived");
  await page.reload();
  await page.getByLabel("Task status").selectOption("archived");
  taskRow = page.getByRole("row", { name: new RegExp(renamedTask) });
  await expect(taskRow).toContainText("Archived");
  await taskRow.getByRole("button", { name: "Reactivate" }).click();
  await expect(taskRow).not.toBeVisible();
  await page.getByLabel("Task status").selectOption("active");
  await expect(page.getByRole("row", { name: new RegExp(renamedTask) })).toContainText("Active");

  await page.getByRole("link", { name: "Back to Projects" }).click();
  projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await projectRow.getByRole("button", { name: "Archive" }).click();
  const archiveProject = page.getByRole("dialog", { name: `Archive ${projectName}?` });
  await expect(archiveProject).toContainText("does not delete this project");
  await archiveProject.getByRole("button", { name: "Archive project" }).click();
  await expect(projectRow).not.toBeVisible();

  await page.getByLabel("Status").selectOption("archived");
  projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await expect(projectRow).toContainText("Archived");
  await page.reload();
  projectRow = page.getByRole("row", { name: new RegExp(projectName) });
  await expect(projectRow).toContainText("Archived");
  await projectRow.getByRole("button", { name: "Reactivate" }).click();
  await expect(projectRow).not.toBeVisible();
  await page.getByLabel("Status").selectOption("active");
  await expect(page.getByRole("row", { name: new RegExp(projectName) })).toContainText("Active");
});
