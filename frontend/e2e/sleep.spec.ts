import { test, expect } from "@playwright/test";

test.describe("Sleep Mode", () => {
  test("sleep tab visible in top bar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Sleep" })).toBeVisible();
  });

  test("clicking sleep tab shows setup screen", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Enter Sleep")).toBeVisible();
  });

  test("preset buttons are interactive", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Wind Down")).toBeVisible();
    await expect(page.getByText("Deep Sleep")).toBeVisible();
    await expect(page.getByText("Full Cycle")).toBeVisible();
    await expect(page.getByText("Custom")).toBeVisible();
  });

  test("audio mode toggle present", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Headphones")).toBeVisible();
    await expect(page.getByText("Speakers")).toBeVisible();
  });

  test("timer options present", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("30m")).toBeVisible();
    await expect(page.getByText("1hr")).toBeVisible();
    await expect(page.getByText("8hr")).toBeVisible();
  });

  test("volume sliders present for all layers", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Music")).toBeVisible();
    await expect(page.getByText("Entrainment")).toBeVisible();
    await expect(page.getByText("Noise")).toBeVisible();
    await expect(page.getByText("Texture")).toBeVisible();
  });

  test("switching back to waveform from sleep", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    await expect(page.getByText("Enter Sleep")).toBeVisible();
    await page.getByRole("button", { name: "Waveform" }).click();
    await expect(page.getByText("Enter Sleep")).not.toBeVisible();
  });

  test("alarm toggle is interactive", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sleep" }).click();
    const toggle = page.getByRole("switch");
    await expect(toggle).toBeVisible();
    await toggle.click();
  });
});
