import { test, expect } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "";
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.describe("Deals / Pipeline", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel(/correo|email/i).fill(EMAIL);
    await page.getByLabel(/^contraseña$/i).fill(PASSWORD);
    await page.getByRole("button", { name: /iniciar|entrar|login/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("pipeline page loads", async ({ page }) => {
    await page.goto("/dashboard/pipeline");
    await expect(
      page.getByRole("heading", { name: /negocio|deal|pipeline/i })
    ).toBeVisible({ timeout: 10_000 });
    // El tablero se ancla en #kanban-board, que ya existe en pipeline-client y
    // ademas es un role=region con aria-label: identificador estable y
    // semantico, sin necesidad de anadir un data-testid solo para el test.
    // (`.kanban` no casaba: la clase real es `kanban-scroll`.)
    await expect(page.locator("#kanban-board")).toBeVisible({ timeout: 10_000 });
  });

  test("deal detail opens without crashing", async ({ page }) => {
    await page.goto("/dashboard/pipeline");
    // La tarjeta es un <Link> a /dashboard/pipeline/<id> (pipeline-client:265).
    // Se excluye el enlace hermano .../edit, que apunta al formulario.
    // El selector anterior ([data-testid='deal-card'], table tbody tr) no existe
    // en el tablero: el test se auto-saltaba en silencio y no probaba nada.
    const firstDeal = page
      .locator("a[href^='/dashboard/pipeline/']:not([href$='/edit'])")
      .first();
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
