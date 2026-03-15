import { test, expect } from "@playwright/test";

test.describe("Phase 6 Polish", () => {
  test("terrain visualizer canvas renders in waveform view", async ({ page }) => {
    await page.goto("/");
    const canvas = page.locator("canvas[aria-hidden='true']");
    await expect(canvas).toBeVisible();
  });

  test("spectral waterfall renders in pipeline panel", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Pipeline" }).click();
    const waterfall = page.locator(".h-16 canvas");
    await expect(waterfall).toBeVisible();
  });

  test("keyboard shortcut 2 switches to timeline", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("2");
    await expect(page.getByText("No arrangement yet")).toBeVisible();
  });

  test("keyboard shortcut 3 switches to sleep", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("3");
    await expect(page.getByText("Enter Sleep")).toBeVisible();
  });

  test("keyboard shortcut 1 switches back to waveform", async ({ page }) => {
    await page.goto("/");
    await page.locator("body").click();
    await page.keyboard.press("3");
    await expect(page.getByText("Enter Sleep")).toBeVisible();
    await page.keyboard.press("1");
    await expect(page.getByText("Enter Sleep")).not.toBeVisible();
  });

  test("toast container exists in DOM", async ({ page }) => {
    await page.goto("/");
    // Toast container is always mounted (fixed position)
    const container = page.locator(".fixed.top-4.right-4");
    await expect(container).toBeAttached();
  });

  test("framer motion animations on buttons", async ({ page }) => {
    await page.goto("/");
    // Verify motion buttons exist (Framer Motion wraps them)
    const waveformBtn = page.getByRole("button", { name: "Waveform" });
    await expect(waveformBtn).toBeVisible();
    // Click should work with motion wrapper
    await waveformBtn.click();
  });
});
