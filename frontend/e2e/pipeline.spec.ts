import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_MP3 = path.resolve(__dirname, "../../Nebula_Drift.mp3");
const API_PORT = process.env.API_PORT || "8001";
const API_BASE = `http://localhost:${API_PORT}`;

test.describe("Pipeline", () => {
  test("pipeline panel shows stage cards when opened", async ({ page }) => {
    await page.goto("/");

    const pipelineBtn = page.getByRole("button", { name: "Pipeline" });
    await pipelineBtn.click();

    await expect(page.getByText("Denoise")).toBeVisible();
    await expect(page.getByText("Separation")).toBeVisible();
    await expect(page.getByText("Super Res")).toBeVisible();
    await expect(page.getByText("Mastering")).toBeVisible();
  });

  test("enhance button is disabled with no track selected", async ({
    page,
  }) => {
    await page.goto("/");

    const pipelineBtn = page.getByRole("button", { name: "Pipeline" });
    await pipelineBtn.click();

    const enhanceBtn = page.getByRole("button", { name: "Enhance" });
    await expect(enhanceBtn).toBeVisible();
    await expect(enhanceBtn).toBeDisabled();
  });

  test("enhance button enables after selecting a track", async ({ page }) => {
    await page.goto("/");

    // Upload a track
    const uploadZone = page.getByText("drop files or click");
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadZone.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_MP3);
    await expect(page.getByText("Nebula_Drift.mp3").first()).toBeVisible({
      timeout: 30000,
    });

    // Select track
    await page.getByText("Nebula_Drift.mp3").first().click();

    // Open pipeline panel
    const pipelineBtn = page.getByRole("button", { name: "Pipeline" });
    await pipelineBtn.click();

    const enhanceBtn = page.getByRole("button", { name: "Enhance" });
    await expect(enhanceBtn).toBeEnabled();
  });

  test("model selector dropdowns are present", async ({ page }) => {
    await page.goto("/");

    const pipelineBtn = page.getByRole("button", { name: "Pipeline" });
    await pipelineBtn.click();

    const selects = page.locator("select");
    const count = await selects.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("pipeline API health", async ({ request }) => {
    // Test pipeline status returns 404 for nonexistent track
    const response = await request.get(
      `${API_BASE}/api/pipeline/status/nonexistent`
    );
    expect(response.status()).toBe(404);
  });
});
