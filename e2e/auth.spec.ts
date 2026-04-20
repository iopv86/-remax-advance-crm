import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Authentication", () => {
  test("login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel(/email/i).fill(EMAIL);
    await page.getByLabel(/contraseña|password/i).fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/email/i).fill("wrong@example.com");
    await page.getByLabel(/contraseña|password/i).fill("wrongpassword");
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();

    await expect(page.getByText(/inválid|incorrect|error/i)).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
