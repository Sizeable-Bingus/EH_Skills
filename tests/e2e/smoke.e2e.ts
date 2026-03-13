import { expect, test } from "@playwright/test";

test("dashboard loads and shows the latest engagement", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Cross-Engagement Dashboard" }),
  ).toBeVisible();
  await expect(page.getByText("bravo.example")).toBeVisible();
});

test("engagement switcher navigates to another engagement", async ({
  page,
}) => {
  await page.goto("/summary?engagement=bravo");

  const combobox = page.locator("#engagement-input");
  await combobox.click();
  await combobox.fill("alpha");
  await page.getByRole("option", { name: "alpha" }).click();

  await expect(page).toHaveURL(/engagement=alpha/);
  await expect(page.getByText("alpha.example")).toBeVisible();
});

test("start scan streams synthetic pipeline progress to completion", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New Scan" }).click();
  await page.locator("#scan-target").fill("https://zeta.example");
  await page.locator("#scan-start").click();

  await expect(page.locator("#pipeline-status")).toBeVisible();
  await expect(page.locator("#pipeline-text")).toContainText("zeta.example");

  await expect(page.locator("#pipeline-text")).toContainText("Complete", {
    timeout: 15_000,
  });
  await expect(page.locator("#log-pre")).toContainText("PIPELINE COMPLETE");
});

test("delete engagement removes the selected engagement and returns to the dashboard", async ({
  page,
}) => {
  await page.goto("/summary?engagement=alpha");

  await page.getByRole("button", { name: "Delete Engagement" }).click();
  await expect(page.locator("#delete-target-name")).toContainText("alpha");
  await page.locator("#delete-confirm").click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("alpha.example")).toHaveCount(0);
});
