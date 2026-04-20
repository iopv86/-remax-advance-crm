import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Deals / Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("pipeline page loads", async ({ page }) => {
    await page.goto("/dashboard/deals");
    await expect(
      page.getByRole("heading", { name: /negocio|deal|pipeline/i })
    ).toBeVisible({ timeout: 10_000 });
    // Kanban columns or table must be present
    await expect(
      page.locator("[data-testid='pipeline'], [data-testid='deals-board'], table, .kanban")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("deal detail opens without crashing", async ({ page }) => {
    await page.goto("/dashboard/deals");
    const firstDeal = page.locator("[data-testid='deal-card'], table tbody tr").first();
    const count = await firstDeal.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await firstDeal.click();
    // Either modal or navigation — just check no crash
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await expect(page.locator("body")).not.toContainText("500");
  });
});
