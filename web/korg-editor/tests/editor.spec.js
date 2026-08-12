import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("loads without browser errors and exposes all parts", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(page.locator("h1")).toContainText("ESX / EMX Pattern Editor");
  await expect(page.locator(".part-tab")).toHaveCount(10);
  await expect(page.locator(".step")).toHaveCount(16);
  expect(errors).toEqual([]);
});

test("edits steps, changes pages and supports undo", async ({ page }) => {
  const firstStep = page.locator(".step").first();
  await firstStep.click();
  await expect(firstStep).toHaveClass(/on/);
  await page.locator("#undoBtn").click();
  await expect(firstStep).not.toHaveClass(/on/);

  await page.locator("#patternLength").selectOption("32");
  await expect(page.locator("#pageSelect option")).toHaveCount(2);
  await page.locator("#pageSelect").selectOption("1");
  await expect(page.locator(".step").first()).toHaveAttribute("data-step", "16");
});

test("local save and load restore a pattern", async ({ page }) => {
  const firstStep = page.locator(".step").first();
  await firstStep.click();
  await page.locator("#saveLocalBtn").click();
  await page.locator("#newPatternBtn").click();
  await expect(firstStep).not.toHaveClass(/on/);
  await page.locator("#loadLocalBtn").click();
  await expect(firstStep).toHaveClass(/on/);
  await expect(page.locator("#statusMessage")).toContainText("geladen und geprüft");
});

test("rejects malformed JSON without breaking the editor", async ({ page }) => {
  await page.locator("#importInput").setInputFiles({
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ broken")
  });
  await expect(page.locator("#statusMessage")).toContainText("Import abgelehnt");
  await expect(page.locator(".step")).toHaveCount(16);
});

test("space inside the pattern name does not start playback", async ({ page }) => {
  const input = page.locator("#patternName");
  await input.focus();
  await input.press("Space");
  await expect(page.locator("#ledDisplay")).not.toContainText("PLAY");
});
