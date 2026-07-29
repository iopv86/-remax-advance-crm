import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Authentication", () => {
  test("login redirects to dashboard", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel(/correo|email/i).fill(EMAIL);
    await page.getByLabel(/^contraseña$/i).fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("unauthenticated user is redirected to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("invalid credentials shows error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill("wrong@example.com");
    await page.getByLabel(/^contraseña$/i).fill("wrongpassword");
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();

    // Anclado al mensaje real que devuelve la API. Un /error/i suelto casa
    // tambien con el label "Console Error" del overlay de Next en dev y rompe
    // el strict mode al resolver 2 elementos.
    await expect(page.getByText(/credenciales inválidas/i)).toBeVisible({ timeout: 8_000 });
    await expect(page).toHaveURL(/\/login/);
  });
});
