import { expect, test } from "@playwright/test";

test.describe("Registration journey", () => {
  test("can register a new account and reach the app", async ({ page }) => {
    const uniqueEmail = `e2e-${Date.now()}@playwright.test`;

    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /create|register/i })).toBeVisible();

    await page.getByLabel(/name/i).fill("E2E Test User");
    await page.getByLabel(/email/i).fill(uniqueEmail);
    await page.getByLabel(/password/i).first().fill("testpassword123");

    // Some forms have a confirm password field
    const confirmField = page.getByLabel(/confirm/i);
    if (await confirmField.isVisible()) {
      await confirmField.fill("testpassword123");
    }

    await page.getByRole("button", { name: /create|register|sign up/i }).click();

    // After registration, the user should be redirected to sign-in or the app
    await expect(page).toHaveURL(/(dashboard|sign-in|accounts)/, { timeout: 15_000 });
  });
});
