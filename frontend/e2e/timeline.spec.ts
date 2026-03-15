import { test, expect } from "@playwright/test";

test.describe("Timeline", () => {
  test("waveform/timeline toggle buttons visible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Waveform" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Timeline" })).toBeVisible();
  });

  test("switching to timeline view shows empty state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByText("No arrangement yet")).toBeVisible();
  });

  test("switching back to waveform hides timeline", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByText("No arrangement yet")).toBeVisible();
    await page.getByRole("button", { name: "Waveform" }).click();
    await expect(page.getByText("No arrangement yet")).not.toBeVisible();
  });

  test("timeline shows arrange controls", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    await expect(page.getByRole("button", { name: "Auto Arrange" })).toBeVisible();
  });

  test("auto arrange disabled with fewer than 2 tracks", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    const btn = page.getByRole("button", { name: "Auto Arrange" });
    await expect(btn).toBeDisabled();
  });

  test("export format dropdowns present in timeline", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Timeline" }).click();
    const selects = page.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
