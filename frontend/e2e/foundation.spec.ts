import { test, expect } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SAMPLE_MP3 = path.resolve(__dirname, "../../Nebula_Drift.mp3");
const API_PORT = process.env.API_PORT || "8001";
const API_BASE = `http://localhost:${API_PORT}`;

test.describe("Foundation", () => {
  test("app loads with correct layout", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("audio engine")).toBeVisible();
    await expect(page.getByText("v0.1")).toBeVisible();
    await expect(page.getByText("Library").first()).toBeVisible();
    await expect(page.getByLabel("Play")).toBeVisible();
    await expect(page.getByText("Export")).toBeVisible();
  });

  test("library toggle works", async ({ page }) => {
    await page.goto("/");

    // Library panel is open by default - should show the panel content
    const libraryHeader = page.locator("aside").getByText("Library");
    await expect(libraryHeader).toBeVisible();

    // Click the Library button in top bar to close the panel
    await page.getByRole("button", { name: "Library" }).click();

    // The aside should no longer be visible
    await expect(page.locator("aside")).not.toBeVisible();

    // Click again to reopen
    await page.getByRole("button", { name: "Library" }).click();
    await expect(page.locator("aside")).toBeVisible();
  });

  test("upload a track and see it in library", async ({ page }) => {
    await page.goto("/");

    const uploadZone = page.getByText("drop files or click");
    await expect(uploadZone).toBeVisible();

    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadZone.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_MP3);

    await expect(page.getByText("Nebula_Drift.mp3")).toBeVisible({
      timeout: 30000,
    });

    await expect(page.getByText(/bpm/)).toBeVisible();
  });

  test("click track to play and see waveform area", async ({ page }) => {
    await page.goto("/");

    const uploadZone = page.getByText("drop files or click");
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      uploadZone.click(),
    ]);
    await fileChooser.setFiles(SAMPLE_MP3);
    await expect(page.getByText("Nebula_Drift.mp3")).toBeVisible({
      timeout: 30000,
    });

    await page.getByText("Nebula_Drift.mp3").click();

    // After clicking a track, the placeholder text should disappear
    await expect(
      page.getByText("select a track from the library")
    ).not.toBeVisible();
  });

  test("transport play/pause button works", async ({ page }) => {
    await page.goto("/");

    const playBtn = page.getByLabel("Play");
    await expect(playBtn).toBeVisible();

    await playBtn.click();
    await expect(page.getByLabel("Pause")).toBeVisible();

    await page.getByLabel("Pause").click();
    await expect(page.getByLabel("Play")).toBeVisible();
  });

  test("A/B toggle switches mode", async ({ page }) => {
    await page.goto("/");

    // Default abMode is "processed", so button shows "B (proc)"
    const abBtn = page.getByText("B (proc)");
    await expect(abBtn).toBeVisible();

    await abBtn.click();
    await expect(page.getByText("A (orig)")).toBeVisible();

    await page.getByText("A (orig)").click();
    await expect(page.getByText("B (proc)")).toBeVisible();
  });

  test("volume slider exists", async ({ page }) => {
    await page.goto("/");

    const slider = page.locator('input[type="range"]');
    await expect(slider).toBeVisible();
  });

  test("pipeline panel toggles", async ({ page }) => {
    await page.goto("/");

    const pipelineBtn = page.getByRole("button", { name: "Pipeline" });
    await expect(pipelineBtn).toBeVisible();

    // Pipeline is closed by default
    await expect(page.getByText("Pipeline controls")).not.toBeVisible();

    // Open pipeline
    await pipelineBtn.click();
    await expect(page.getByText("Pipeline controls")).toBeVisible();

    // Close pipeline
    await pipelineBtn.click();
    await expect(page.getByText("Pipeline controls")).not.toBeVisible();
  });

  test("API health check", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/health`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  test("API list tracks", async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/library`);
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
  });
});
