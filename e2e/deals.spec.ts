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
    // La tarjeta es un <Link> a /dashboard/pipeline/<uuid> (pipeline-client:265).
    // Se excluyen los hermanos .../edit (formulario) y .../new (el boton "Nueva
    // oportunidad", que aparece 2 veces y es el PRIMER enlace del DOM que casa
    // el prefijo: sin excluirlo, .first() abria el formulario de alta y el test
    // pasaba sin llegar a abrir ninguna ficha).
    // El selector anterior ([data-testid='deal-card'], table tbody tr) no existe
    // en el tablero: el test se auto-saltaba en silencio y no probaba nada.
    const firstDeal = page
      .locator(
        "a[href^='/dashboard/pipeline/']:not([href$='/edit']):not([href$='/new'])"
      )
      .first();
    const count = await firstDeal.count();
    if (count === 0) {
      test.skip();
      return;
    }
    await firstDeal.click();
    // Se afirma la URL destino antes que la ausencia de crash: sin esto el test
    // pasaba igual navegando a cualquier sitio, que es justo como el selector
    // roto anterior lograba pasar sin abrir ninguna ficha.
    await expect(page).toHaveURL(/\/dashboard\/pipeline\/[0-9a-f-]{36}/, {
      timeout: 10_000,
    });
    await expect(page.locator("body")).not.toContainText("Something went wrong");
    await expect(page.locator("body")).not.toContainText("500");
  });
});
