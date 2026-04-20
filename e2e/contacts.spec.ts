import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Contacts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("contacts page loads and shows list", async ({ page }) => {
    await page.goto("/dashboard/contacts");
    await expect(page.getByRole("heading", { name: /contacto|cliente/i })).toBeVisible();
    // Table or empty state must render
    await expect(
      page.locator("table, [data-testid='contacts-list'], [data-testid='empty-state']")
    ).toBeVisible({ timeout: 10_000 });
  });

  test("can search contacts", async ({ page }) => {
    await page.goto("/dashboard/contacts");
    const searchInput = page.getByPlaceholder(/buscar|search/i);
    await expect(searchInput).toBeVisible();
    await searchInput.fill("test");
    // Results update without crashing (debounced)
    await page.waitForTimeout(600);
    await expect(page.locator("body")).not.toContainText("error");
  });

  test("contact detail page loads", async ({ page }) => {
    await page.goto("/dashboard/contacts");
    const firstContact = page.locator("table tbody tr, [data-testid='contact-row']").first();
    const count = await firstContact.count();
    if (count === 0) {
      test.skip(); // No contacts to test
      return;
    }
    await firstContact.click();
    await expect(page).toHaveURL(/\/dashboard\/contacts\/.+/);
    await expect(page.getByRole("heading")).toBeVisible();
  });
});
